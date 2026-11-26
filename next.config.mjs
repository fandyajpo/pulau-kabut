/** @type {import('next').NextConfig} */
const nextConfig = {
  // The WebGL engine mounts once into a canvas; strict mode would mount it twice in dev.
  reactStrictMode: false,
};

export default nextConfig;
