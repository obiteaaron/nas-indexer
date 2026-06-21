import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './styles/main.css'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { RecycleScroller } from 'vue-virtual-scroller'
import { initTokenFromUrl } from './api/auth'

// 启动时从 URL 提取 Token（如有）
initTokenFromUrl()

const app = createApp(App)
app.use(router)
app.component('RecycleScroller', RecycleScroller)
app.mount('#app')