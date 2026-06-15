import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import FileListView from '../views/FileListView.vue'
import SearchView from '../views/SearchView.vue'
import StatisticsView from '../views/StatisticsView.vue'
import SettingsView from '../views/SettingsView.vue'
import TagManagerView from '../views/TagManagerView.vue'
import GameWallView from '../views/game/GameWallView.vue'
import GameSteamView from '../views/game/GameSteamView.vue'
import GameSettingsView from '../views/game/GameSettingsView.vue'

const routes: RouteRecordRaw[] = [
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
      { path: 'settings', name: 'game-settings', component: GameSettingsView }
    ]
  },
  { path: '/games', redirect: '/game/wall' },
  { path: '/settings', name: 'settings', component: SettingsView }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router