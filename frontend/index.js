import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';

import App from './App';
import BackofficeApp from './src/navigation/BackofficeApp';

const esBackoffice =
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  window.location.pathname.startsWith('/backoffice');

registerRootComponent(esBackoffice ? BackofficeApp : App);