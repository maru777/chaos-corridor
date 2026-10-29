import { defineConfig } from 'vite';

// GitHub Pages のサブパス（/chaos-corridor/）でも動くよう、相対パスで出力する
export default defineConfig({
  base: './',
});
