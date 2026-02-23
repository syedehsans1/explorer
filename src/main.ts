// import 'ping-widget';
import App from '@/App.vue';
import i18n from '@/plugins/i18n';
import '@/style.css';
import { createApp, ref } from 'vue';
import { createPinia } from 'pinia';
import LazyLoad from 'lazy-load-vue3';
import { createHead } from '@vueuse/head';

import router from './router';
import { useBaseStore } from './stores/useBaseStore';
import Toast, { POSITION } from 'vue-toastification'
import 'vue-toastification/dist/index.css'

// Create vue app
const app = createApp(App);
const head = createHead();

app.use(Toast, {
  position: POSITION.BOTTOM_RIGHT,
  timeout: 30000,
  closeOnClick: true,
  pauseOnHover: true,
})

// Use plugins
app.use(i18n);
app.use(createPinia());
app.use(router);
app.use(head);
app.use(LazyLoad, { component: true });

app.mount('#app');

// fetch latest block every 6s
const blockStore = useBaseStore();
const requestCounter = ref(0);
setInterval(() => {
  requestCounter.value += 1;
  if (requestCounter.value < 5) {
    // max allowed request
    blockStore.fetchLatest().finally(() => (requestCounter.value -= 1));
  }
}, 15000);
