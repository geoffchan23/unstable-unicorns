module.exports = {
  apps: [
    {
      name: 'unicorns',
      script: 'unicorns-server.mjs',
      cwd: '/home/ubuntu/unicorns',
      max_memory_restart: '200M',
      time: true,
    },
  ],
};
