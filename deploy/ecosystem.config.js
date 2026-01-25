module.exports = {
  apps: [
    {
      name: 'bookmarx-api',
      script: 'dist/server.js',
      cwd: '/home/gazza/bookmarx/src/server',
      instances: 'max',
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'development',
        PORT: 3005
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3005
      },
      error_file: '/var/log/bookmarx/error.log',
      out_file: '/var/log/bookmarx/out.log',
      log_file: '/var/log/bookmarx/combined.log',
      time: true,
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
