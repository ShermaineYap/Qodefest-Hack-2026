/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{ source: "/", destination: "/demo.html" }];
  },
};
export default nextConfig;
