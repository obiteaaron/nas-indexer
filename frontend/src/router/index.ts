import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { hasApiToken } from '../api/auth'

// 路由懒加载 - 按需加载，减少首屏体积
const HomeView = () => import('../views/HomeView.vue')
const FileListView = () => import('../views/FileListView.vue')
const SearchView = () => import('../views/SearchView.vue')
const StatisticsView = () => import('../views/StatisticsView.vue')
const SettingsView = () => import('../views/SettingsView.vue')
const TagManagerView = () => import('../views/TagManagerView.vue')
const GameWallView = () => import('../views/game/GameWallView.vue')
const GameSteamView = () => import('../views/game/GameSteamView.vue')
const GameSettingsView = () => import('../views/game/GameSettingsView.vue')
const ProfileBackupView = () => import('../views/game/ProfileBackupView.vue')
const AuthRequiredView = () => import('../views/AuthRequired.vue')

const routes: RouteRecordRaw[] = [
  { path: '/auth-required', name: 'auth-required', component: AuthRequiredView },
  { path: '/', name: 'home', component: HomeView },
  { path: '/files', name: 'files', component: FileListView },
  { path: '/search', name: 'search', component: SearchView },
  { path: '/statistics', name: 'statistics', component: StatisticsView },
  { path: '/tags', name: 'tags', component: TagManagerView },
  {
    path: '/game',
    name: 'game',
    redirect: '/game/wall',
    children: [
      { path: 'wall', name: 'game-wall', component: GameWallView },
      { path: 'steam', name: 'game-steam', component: GameSteamView },
      { path: 'settings', name: 'game-settings', component: GameSettingsView },
      { path: 'backup', name: 'game-backup', component: ProfileBackupView }
    ]
  },
  { path: '/games', redirect: '/game/wall' },
  { path: '/settings', name: 'settings', component: SettingsView }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫：检查 Token
router.beforeEach((to, from, next) => {
  // 认证提示页面无需 Token
  if (to.name === 'auth-required') {
    next();
    return;
  }

  // 其他页面需要 Token
  if (!hasApiToken()) {
    next({ name: 'auth-required' });
    return;
  }

  next();
})

export default router