/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: { root: require("path").resolve(__dirname, "../..") },
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  env: {
    API_URL: process.env.API_URL || 'http://localhost:3005',
  },
}

module.exports = nextConfig
