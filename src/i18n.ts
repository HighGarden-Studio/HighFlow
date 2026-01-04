import { createI18n } from 'vue-i18n';
import ko from './locales/ko.json';
import en from './locales/en.json';

// Type-define 'en' as the master schema for type safety
type MessageSchema = typeof ko;

const i18n = createI18n<[MessageSchema], 'ko' | 'en'>({
    legacy: false, // Use Composition API
    locale: 'ko', // Default locale
    fallbackLocale: 'en',
    messages: {
        ko,
        en,
    },
    globalInjection: true, // Allow usage in template without explicit import
});

export default i18n;
