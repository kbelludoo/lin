/**
 * lin_neural_engine.mjs — Runtime Neural e Motor Tensorial Nativo do LIN
 * 
 * Implementa matematicamente o Transformer Decoder completo sem dependências externas.
 */

export class LinTensorEngine {
  // 1. MatMul: Multiplicação de matrizes 2D (A: M x K, B: K x N -> C: M x N)
  static matmul(A, B) {
    const M = A.length;
    const K = A[0].length;
    const N = B[0].length;
    const C = Array.from({ length: M }, () => new Float32Array(N));

    for (let i = 0; i < M; i++) {
      for (let j = 0; j < N; j++) {
        let sum = 0.0;
        for (let k = 0; k < K; k++) {
          sum += A[i][k] * B[k][j];
        }
        C[i][j] = sum;
      }
    }
    return C;
  }

  // 2. RMSNorm: Root Mean Square Normalization
  static rmsnorm(x, weight, eps = 1e-5) {
    const seqLen = x.length;
    const dim = x[0].length;
    const out = Array.from({ length: seqLen }, () => new Float32Array(dim));

    for (let i = 0; i < seqLen; i++) {
      let sumSq = 0.0;
      for (let j = 0; j < dim; j++) {
        sumSq += x[i][j] * x[i][j];
      }
      const scale = 1.0 / Math.sqrt(sumSq / dim + eps);
      for (let j = 0; j < dim; j++) {
        out[i][j] = x[i][j] * scale * weight[j];
      }
    }
    return out;
  }

  // 3. Softmax com estabilidade numérica
  static softmax(arr) {
    let max = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] > max) max = arr[i];
    }
    let sum = 0.0;
    const exp = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      exp[i] = Math.exp(arr[i] - max);
      sum += exp[i];
    }
    for (let i = 0; i < arr.length; i++) {
      exp[i] /= sum;
    }
    return exp;
  }

  // 4. Multi-Head Attention com Máscara Causal
  static attention(x, wq, wk, wv, wo, nHeads) {
    const seqLen = x.length;
    const dim = x[0].length;
    const headDim = dim / nHeads;
    const scale = 1.0 / Math.sqrt(headDim);

    const Q = this.matmul(x, wq);
    const K = this.matmul(x, wk);
    const V = this.matmul(x, wv);

    const outConcat = Array.from({ length: seqLen }, () => new Float32Array(dim));

    for (let h = 0; h < nHeads; h++) {
      const hOffset = h * headDim;

      for (let i = 0; i < seqLen; i++) {
        const scores = new Float32Array(i + 1);

        for (let j = 0; j <= i; j++) {
          let dot = 0.0;
          for (let d = 0; d < headDim; d++) {
            dot += Q[i][hOffset + d] * K[j][hOffset + d];
          }
          scores[j] = dot * scale;
        }

        const weights = this.softmax(scores);

        for (let d = 0; d < headDim; d++) {
          let val = 0.0;
          for (let j = 0; j <= i; j++) {
            val += weights[j] * V[j][hOffset + d];
          }
          outConcat[i][hOffset + d] = val;
        }
      }
    }

    return this.matmul(outConcat, wo);
  }

  // 5. SwiGLU / Feed-Forward Block: (Swish(x @ W_gate) * (x @ W_up)) @ W_down
  static swiglu(x, wGate, wUp, wDown) {
    const seqLen = x.length;
    const hiddenDim = wGate[0].length;

    const gate = this.matmul(x, wGate);
    const up = this.matmul(x, wUp);
    const mid = Array.from({ length: seqLen }, () => new Float32Array(hiddenDim));

    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j < hiddenDim; j++) {
        const g = gate[i][j];
        const swish = g * (1.0 / (1.0 + Math.exp(-g))); // Silu/Swish activation
        mid[i][j] = swish * up[i][j];
      }
    }

    return this.matmul(mid, wDown);
  }

  // 6. Embedding Lookup
  static embed(tokenIds, wte) {
    return tokenIds.map(id => Float32Array.from(wte[id % wte.length]));
  }

  // 7. Amostragem de Logits (Greedy / Top-P)
  static sampleTopP(logits, temperature = 0.0, topP = 0.9) {
    if (temperature === 0.0) {
      let maxIdx = 0;
      let maxVal = -Infinity;
      for (let i = 0; i < logits.length; i++) {
        if (logits[i] > maxVal) {
          maxVal = logits[i];
          maxIdx = i;
        }
      }
      return maxIdx;
    }
    const probs = this.softmax(logits.map(l => l / temperature));
    return this.sampleFromProbs(probs, topP);
  }

  static sampleFromProbs(probs, topP) {
    const indexed = Array.from(probs).map((p, i) => ({ prob: p, idx: i }));
    indexed.sort((a, b) => b.prob - a.prob);

    let cum = 0.0;
    const filtered = [];
    for (const item of indexed) {
      filtered.push(item);
      cum += item.prob;
      if (cum >= topP) break;
    }

    let r = Math.random() * cum;
    for (const item of filtered) {
      r -= item.prob;
      if (r <= 0) return item.idx;
    }
    return filtered[0].idx;
  }
}

/**
 * LIN Transformer Model: Executa o grafo forward completo
 */
export class LinTransformerModel {
  constructor(config = {}) {
    this.dim = config.dim || 64;
    this.nHeads = config.nHeads || 4;
    this.nLayers = config.nLayers || 2;
    this.vocabSize = config.vocabSize || 128;
    this.hiddenDim = config.hiddenDim || 128;
    this.weights = config.weights || this.initRandomWeights();
  }

  initRandomWeights() {
    const randMat = (rows, cols) =>
      Array.from({ length: rows }, () =>
        Float32Array.from({ length: cols }, () => (Math.random() - 0.5) * 0.1)
      );
    const ones = len => new Float32Array(len).fill(1.0);

    const layers = [];
    for (let l = 0; l < this.nLayers; l++) {
      layers.push({
        attn_norm: ones(this.dim),
        wq: randMat(this.dim, this.dim),
        wk: randMat(this.dim, this.dim),
        wv: randMat(this.dim, this.dim),
        wo: randMat(this.dim, this.dim),
        ffn_norm: ones(this.dim),
        w_gate: randMat(this.dim, this.hiddenDim),
        w_up: randMat(this.dim, this.hiddenDim),
        w_down: randMat(this.hiddenDim, this.dim)
      });
    }

    return {
      wte: randMat(this.vocabSize, this.dim),
      layers,
      final_norm: ones(this.dim),
      lm_head: randMat(this.dim, this.vocabSize)
    };
  }

  // Forward Pass completo conforme a especificação LIN
  forward(tokenIds) {
    let x = LinTensorEngine.embed(tokenIds, this.weights.wte);

    for (let l = 0; l < this.nLayers; l++) {
      const w = this.weights.layers[l];

      // Self-Attention + Residual
      const norm1 = LinTensorEngine.rmsnorm(x, w.attn_norm);
      const attn = LinTensorEngine.attention(norm1, w.wq, w.wk, w.wv, w.wo, this.nHeads);
      for (let i = 0; i < x.length; i++) {
        for (let j = 0; j < this.dim; j++) x[i][j] += attn[i][j];
      }

      // SwiGLU FFN + Residual
      const norm2 = LinTensorEngine.rmsnorm(x, w.ffn_norm);
      const ffn = LinTensorEngine.swiglu(norm2, w.w_gate, w.w_up, w.w_down);
      for (let i = 0; i < x.length; i++) {
        for (let j = 0; j < this.dim; j++) x[i][j] += ffn[i][j];
      }
    }

    const finalNorm = LinTensorEngine.rmsnorm(x, this.weights.final_norm);
    const lastTokenVector = [finalNorm[finalNorm.length - 1]];
    const logits = LinTensorEngine.matmul(lastTokenVector, this.weights.lm_head)[0];

    return logits;
  }
}
