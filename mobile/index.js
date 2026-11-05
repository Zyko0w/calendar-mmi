import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widgets';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Widgets d'écran d'accueil : rendu, mises à jour périodiques et clics (case « rendu »).
if (Platform.OS === 'android') registerWidgetTaskHandler(widgetTaskHandler);
