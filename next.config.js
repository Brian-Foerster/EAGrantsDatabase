/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  basePath: '/EAGrantsDatabase',
  assetPrefix: '/EAGrantsDatabase',
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
