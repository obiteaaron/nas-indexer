import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import FileListView from '../views/FileListView.vue'
import SearchView from '../views/SearchView.vue'
import StatisticsView from '../views/StatisticsView.vue'
import SettingsView from '../views/SettingsView.vue'
import TagManagerView from '../views/TagManagerView.vue'
import GameWallView from '../views/GameWallView.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/files', name: 'files', component: FileListView },
  { path: '/search', name: 'search', component: SearchView },
  { path: '/statistics', name: 'statistics', component: StatisticsView },
  { path: '/tags', name: 'tags', component: TagManagerView },
  { path: '/games', name: 'games', component: GameWallView },
  { path: '/settings', name: 'settings', component: SettingsView }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router