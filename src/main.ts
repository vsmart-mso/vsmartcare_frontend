import { createApp } from 'vue'
import App from './App.vue'

// router
import router from '@/router'

// pinia
import { createPinia } from 'pinia'

// vue query
import { VueQueryPlugin } from '@tanstack/vue-query'

// tailwind css
import './style.css'

const app = createApp(App)

app.use(router)
app.use(createPinia())
app.use(VueQueryPlugin)

app.mount('#app')