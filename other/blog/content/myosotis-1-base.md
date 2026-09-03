# Myosotis-1-base (100M)

**Myosotis-1-base** is the first flagship release from us, introducing a 100-million parameter recurrent language model built on the **FWKV** architecture.

Myosotis-1 is engineered to **never truly forget**—using a mathematically clamped exponential decay that guarantees an infinite effective context window while maintaining blazing-fast inference on consumer hardware.

---

## Architecture at a Glance

Myosotis-1 occupies a unique position in the sequence modeling spectrum: it acts as a **pristine mathematical bridge** between Linear State Space Models (S4/S5) and the WKV (RWKV) gating paradigm.

| Component | Specification |
| :--- | :--- |
| **Type** | Diagonal LTI (Linear Time-Invariant) SSM + RWKV-style Gating |
| **Total Parameters** | ~100 Million |
| **Hidden Dimension (`d_model`)** | 768 |
| **Embedding Bottleneck (`d_emb`)** | 192 |
| **Layers (`n_layers`)** | 13 |
| **FFN Expansion Factor** | 4× (GELU activation) |
| **Context Length** | 1024 tokens (packed training) |
| **Vocabulary** | 50,257 (GPT-2 tokenizer) |
| **Weight Tying** | Fully tied, factorized input/output head |

---

## Core Technical Innovations

### 1. The FWKV Recurrent Core
Instead of pairwise attention, Myosotis uses a fixed-size state vector updated via a gated linear recurrence:

$$ S_t = S_{t-1} \odot W + k_t \odot v_t $$

- \( W = \text{clamp}(\sigma(w), 0.1) \) is a **learned, constant-per-channel decay**.
- By clamping the minimum decay to **0.1**, the model guarantees that past information decays exponentially but **never reaches zero**.

### 2. Training via \( O(\log T) \) Parallel Scan
Because \( W \) is **data-independent** (LTI), the recurrence can be trained using a pure-PyTorch Hillis-Steele associative scan. This bypasses the sequential bottleneck of RNNs without requiring custom CUDA kernels, making the architecture trivially portable across NVIDIA, AMD, Apple Silicon, and standard CPUs.

### 3. Factorized Tied Embeddings
We employ a low-rank factorization for the embedding layer:
- Stored weight shape: \(V \times d_{emb}\) (vs. standard \(V \times d_{model}\)), with a learned linear projection mapping inputs up to the full hidden dimension \(d_{model}\) before the first block, and back down to \(d_{emb}\) for the final logits (so the internal representation remains \(d_{model}\)).
- This saves \(V \times (d_{model} - d_{emb})\) parameters (~15 million in our setup) while maintaining full representational capacity.
- The output head uses the **transposed projection**, enabling chunked cross-entropy loss to avoid materializing huge logit tensors during training.

### 4. Loss Masking for Conversational AI
Fine-tuned exclusively on multi-turn chat data, the loss is masked so that **only assistant tokens contribute to the gradient**. This forces the model to master response generation while treating user prompts purely as contextual memory.

---

## Training Regimen

Myosotis-1 was trained in two distinct stages, leveraging the *Chinchilla* scaling law (20× parameter count in tokens) for optimal performance.

### Stage 1: Pretraining (General Language)
- **Data Mixture (SmolLM-Corpus style):**
  - 60% `fineweb-edu-dedup` (educational web text)
  - 25% `cosmopedia-v2` (synthetic textbooks)
  - 15% `python-edu` (code understanding)
- **Total Tokens:** ~2 Billion (Chinchilla-optimal)
- **Optimizer:** AdamW (fused), \( \text{LR} = 1 \times 10^{-4} \)
- **Precision:** BF16 Mixed Precision with Gradient Checkpointing

> [!Note]
> Val perplexity at save time: 62.76

---

## Performance & Speed

Myosotis-1 is optimized for **hardware portability** over pure theoretical FLOPs. It achieves this by avoiding data-dependent (selective) gating, allowing pure vectorized operations.

- **Inference Style:** True RNN. No growing KV cache. Constant memory usage \( L \times d_{model} \).
- **CPU Speed :** **~[...] tokens/second** (pure PyTorch, no custom kernels).
- **GPU Speed :** **~130 tokens/second** with BF16.

While we sacrifice the "selectivity" of models like Mamba, we gain the ability to run effectively on devices where CUDA is unavailable (edge devices, free-tier cloud notebooks, and standard servers).

## Evaluation

| Tasks | Version | Filter | n-shot | Metric | | Value | | Stderr |
|---|---|---|---|---|---|---|---|
| arc_challenge | 1 | none | 0 | acc | ↑ | 0.1664 | ± | 0.0109 |
| | | none | 0 | acc_norm | ↑ | 0.2159 | ± | 0.0120 |
| arc_easy | 1 | none | 0 | acc | ↑ | 0.3864 | ± | 0.0100 |
| | | none | 0 | acc_norm | ↑ | 0.3434 | ± | 0.0097 |
| hellaswag | 1 | none | 0 | acc | ↑ | 0.2621 | ± | 0.0044 |
| | | none | 0 | acc_norm | ↑ | 0.2579 | ± | 0.0044 |
| piqa | 1 | none | 0 | acc | ↑ | 0.5756 | ± | 0.0115 |
| | | none | 0 | acc_norm | ↑ | 0.5533 | ± | 0.0116 |

Not the best results, we blame the dataset.

---

## Usage Example

Myosotis-1 is fully compatible with the HuggingFace `transformers` library.

```py
from transformers import AutoModelForCausalLM, AutoTokenizer

tok = AutoTokenizer.from_pretrained("FWKV/Myosotis-1-base", trust_remote_code=True)
model = AutoModelForCausalLM.from_pretrained("FWKV/Myosotis-1-base", trust_remote_code=True)

inputs = tok("The quick brown fox", return_tensors="pt")
out = model.generate(**inputs, max_new_tokens=150, use_cache=True)
print(tok.decode(out[0]))
```

---

## Strengths & Limitations

| Strengths | Limitations |
| :--- | :--- |
| **Blazing Fast CPU Inference:** [..] tokens/sec on cheap cloud instances. | **Non-Selective Decay:** Less mathematically expressive than Mamba or RWKV-v5. |
| **Infinite Context Memory:** Clamped decay ensures no hard cutoff. | **Factual Hallucination:** As a 100M model, fact-retrieval is limited. |
| **No Custom Kernels:** Runs anywhere PyTorch runs (AMD, Intel, ARM). | **No Token-Shift:** Lacks the strong local inductive bias of full RWKV. |
| **Memory Efficient:** Constant-size state, scales perfectly with sequence length. | **Knowledge Capacity:** Smaller than billion-parameter counterparts. |
| **Stable Training:** Clamped sigmoid prevents vanishing/exploding gradients. | **ROSA Not Included:** This is the base recurrent model, separate from the FWKV-ROSA research paper. |

---

## Technical References

- **Inspirations:** RWKV (Peng et al.), S4/S5 (Gu et al.), and the Transformer FFN sandwich.

---

## Licensing & Acknowledgements

**License:** Apache 2.0

This model is dedicated to the open-source community. Built by **Daniel B. (FlameF0X)** using vast.ai, PyTorch, and the Hugging Face ecosystem.

<div align="center">

*"Simplicity is all you need."*

</div>
