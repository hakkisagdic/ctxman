import DefaultTheme from 'vitepress/theme';
import './style.css';

// Import custom components
import FeaturesGrid from '../components/FeaturesGrid.vue';
import CodeDemo from '../components/CodeDemo.vue';
import GitHubStars from '../components/GitHubStars.vue';
import InteractiveDemo from '../components/InteractiveDemo.vue';
import LanguageSwitcher from '../components/LanguageSwitcher.vue';
import HeroSection from '../components/HeroSection.vue';
import QuickStart from '../components/QuickStart.vue';

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Register global components
    app.component('FeaturesGrid', FeaturesGrid);
    app.component('CodeDemo', CodeDemo);
    app.component('GitHubStars', GitHubStars);
    app.component('InteractiveDemo', InteractiveDemo);
    app.component('LanguageSwitcher', LanguageSwitcher);
    app.component('HeroSection', HeroSection);
    app.component('QuickStart', QuickStart);
  },
};
