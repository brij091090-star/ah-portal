/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow large API responses for CSV refresh
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

module.exports = nextConfig
