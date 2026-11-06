import { Currency, Locale } from './types';

export const TRANSLATIONS: Record<Locale, Record<string, string>> = {
  en: {
    nav_features: 'Features',
    nav_how: 'How It Works',
    nav_pricing: 'Pricing',
    nav_about: 'About',
    nav_faq: 'FAQ',
    cta_start_free: 'Start Free',
    cta_open_workspace: 'Open Workspace',
    hero_kicker: 'International Adaptive English SaaS · EN / UZ / RU',
    hero_title: 'One AI brain uniting your mood, real-world dialogue, and grammar reasoning.',
    hero_subtitle:
      'Learn vocabulary matched to how you feel today, practice those exact words in live airport or interview roleplay, and turn real speaking mistakes into interactive detective cases.',
    hero_primary: 'Create Free Account',
    hero_secondary: 'Explore Interactive Modes',
    mode_mood: 'Mood Mode',
    mode_simulator: 'Simulator Mode',
    mode_detective: 'Detective Mode',
    mode_game: 'Visual Quest & Game',
    mode_teacher: 'AI Teacher',
    dash_overview: 'Overview',
    dash_analytics: 'Analytics & Plan',
    dash_billing: 'Subscription & Credits',
    dash_growth: 'Referrals & Team',
    dash_security: 'Profile & Security',
    admin_console: 'Super Admin',
    sign_in: 'Sign In',
    sign_out: 'Sign Out',
    register: 'Create Account',
    demo_notice: 'Demo preview testimonial — clearly marked until verified production reviews are collected.',
  },
  uz: {
    nav_features: 'Imkoniyatlar',
    nav_how: 'Qanday ishlaydi',
    nav_pricing: 'Tariflar',
    nav_about: 'Biz haqimizda',
    nav_faq: 'Savollar',
    cta_start_free: 'Bepul boshlash',
    cta_open_workspace: 'Darsga kirish',
    hero_kicker: 'Xalqaro Moslashuvchan Ingliz Tili Platformasi · EN / UZ / RU',
    hero_title: 'Kayfiyatingiz, jonli muloqot va grammatik mantiqni birlashtiruvchi yagona AI tizimi.',
    hero_subtitle:
      'Bugungi kayfiyatingizga mos so‘zlarni o‘rganing, ularni aeroport yoki suhbat simulyatorida qo‘llang va xatolaringizni qiziqarli detektiv jumboqlarga aylantiring.',
    hero_primary: 'Bepul ro‘yxatdan o‘tish',
    hero_secondary: 'Rejimlarni ko‘rish',
    mode_mood: 'Kayfiyat rejimi',
    mode_simulator: 'Hayotiy simulyator',
    mode_detective: 'Detektiv grammatika',
    mode_game: 'Vizual Kvest O‘yini',
    mode_teacher: 'AI Ustoz',
    dash_overview: 'Asosiy panel',
    dash_analytics: 'Tahlil va reja',
    dash_billing: 'Obuna va kreditlar',
    dash_growth: 'Referal va jamoa',
    dash_security: 'Profil va xavfsizlik',
    admin_console: 'Super Admin',
    sign_in: 'Kirish',
    sign_out: 'Chiqish',
    register: 'Ro‘yxatdan o‘tish',
    demo_notice: 'Namuna sifatidagi fikr — haqiqiy foydalanuvchi izohlari yig‘ilgunga qadar aniq belgilangan.',
  },
  ru: {
    nav_features: 'Возможности',
    nav_how: 'Как это работает',
    nav_pricing: 'Тарифы',
    nav_about: 'О платформе',
    nav_faq: 'Вопросы',
    cta_start_free: 'Начать бесплатно',
    cta_open_workspace: 'Открыть кабинет',
    hero_kicker: 'Международная адаптивная AI-платформа английского языка · EN / UZ / RU',
    hero_title: 'Единый AI-интеллект для словарного запаса, ролевых диалогов и грамматической логики.',
    hero_subtitle:
      'Изучайте лексику под ваше текущее настроение, применяйте слова в реальных сценариях и превращайте грамматические ошибки в интерактивные детективные расследования.',
    hero_primary: 'Создать бесплатный аккаунт',
    hero_secondary: 'Посмотреть режимы',
    mode_mood: 'Режим настроения',
    mode_simulator: 'Симулятор диалогов',
    mode_detective: 'Грамматический детектив',
    mode_game: 'Визуальный Квест и Арена',
    mode_teacher: 'AI Преподаватель',
    dash_overview: 'Обзор',
    dash_analytics: 'Аналитика и план',
    dash_billing: 'Подписка и кредиты',
    dash_growth: 'Рефералы и команды',
    dash_security: 'Профиль и защита',
    admin_console: 'Супер-Админ',
    sign_in: 'Войти',
    sign_out: 'Выйти',
    register: 'Регистрация',
    demo_notice: 'Демонстрационный отзыв — явно помечен до сбора подтвержденных отзывов клиентов.',
  },
};

export function t(locale: Locale, key: string): string {
  return TRANSLATIONS[locale]?.[key] || TRANSLATIONS.en[key] || key;
}

export function formatMoney(
  amountUsd: number,
  amountUzs: number | undefined,
  currency: Currency,
  usdToUzsRate = 12850
): string {
  if (currency === 'UZS') {
    const uzs = typeof amountUzs === 'number' && amountUzs > 0 ? amountUzs : Math.round(amountUsd * usdToUzsRate);
    if (amountUsd === 0) return "0 so'm";
    return `${uzs.toLocaleString('en-US')} UZS`;
  }
  if (amountUsd === 0) return '$0';
  const formatted = Number.isInteger(amountUsd) ? amountUsd.toString() : amountUsd.toFixed(2);
  return `$${formatted}`;
}
