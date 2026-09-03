/** @type {import('next').NextConfig} */
const nextConfig = {
  // Genera un build autocontenido (server.js + node_modules mínimos) —
  // hace que la imagen de Docker sea mucho más chica y rápida de levantar.
  output: "standalone",
};

module.exports = nextConfig;
