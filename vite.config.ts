import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  // server: {
  //   host: true, // allow LAN access
  //   https: true, // serve with self-signed HTTPS (needed for sensors on iOS)
  // },
  plugins: [],
});
