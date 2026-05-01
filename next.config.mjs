import webpack from 'next/dist/compiled/webpack/webpack.js';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    // wagmi tempo module tries `import('accounts')` which is optional.
    // Tell webpack to treat it as an empty module.
    config.plugins.push(
      new webpack.webpack.IgnorePlugin({
        resourceRegExp: /^accounts$/,
      }),
    );
    return config;
  },
};

export default nextConfig;
