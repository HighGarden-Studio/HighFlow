/**
 * Vue 3 Application Entry Point
 */

import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import App from './App.vue';
import router from './router';
import './style.css';

// Create Vue app
const app = createApp(App);

// Create Pinia store with persistence plugin
const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);
app.use(pinia);

// Use Vue Router
app.use(router);

// Use i18n
import i18n from '../i18n';
app.use(i18n);

// Mount app
app.mount('#app');
