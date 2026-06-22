<!-- frontend/src/views/AuthRequired.vue -->

<template>
  <div class="auth-required-page">
    <div class="auth-card">
      <div class="auth-icon">🔐</div>
      <h1>需要认证</h1>
      <p class="auth-desc">NAS Indexer 已启用安全认证</p>

      <div class="auth-instruction">
        <p>请在服务器日志中获取 Token，然后访问：</p>
        <code class="auth-url">http://localhost:3000/?token=YOUR_TOKEN</code>
      </div>

      <div class="auth-manual">
        <p>或手动输入 Token：</p>
        <div class="auth-input-group">
          <input
            v-model="manualToken"
            type="text"
            placeholder="输入 API Token"
            class="auth-input"
          />
          <button @click="applyToken" class="auth-btn" :disabled="!manualToken">
            确认
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { setApiToken } from '../api/auth';

const router = useRouter();
const manualToken = ref('');

function applyToken() {
  if (manualToken.value.trim()) {
    setApiToken(manualToken.value.trim());
    router.push('/');
  }
}
</script>

<style scoped>
.auth-required-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: var(--bg-color, #f5f5f5);
}

.auth-card {
  background: white;
  border-radius: 12px;
  padding: 40px;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.auth-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.auth-card h1 {
  margin: 0 0 8px;
  color: #333;
}

.auth-desc {
  color: #666;
  margin-bottom: 24px;
}

.auth-instruction {
  background: #f0f0f0;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 24px;
}

.auth-instruction p {
  margin: 0 0 8px;
  color: #555;
}

.auth-url {
  display: block;
  background: #333;
  color: #fff;
  padding: 8px 12px;
  border-radius: 4px;
  font-size: 13px;
  word-break: break-all;
}

.auth-manual p {
  margin: 0 0 12px;
  color: #555;
}

.auth-input-group {
  display: flex;
  gap: 8px;
}

.auth-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.auth-input:focus {
  outline: none;
  border-color: #4a90d9;
}

.auth-btn {
  padding: 10px 20px;
  background: #4a90d9;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.auth-btn:hover:not(:disabled) {
  background: #3a80c9;
}

.auth-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}
</style>