module.exports = {
  apps: [
    {
      name: 'bookmarx-api',
      script: 'npm',
      args: 'run start',
      cwd: '/home/gazza/bookmarx/src/website',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '750M',
      env: {
        NODE_ENV: 'development',
        PORT: 3005,
        DATABASE_PATH: '/home/gazza/bookmarx/src/website/data/bookmarx.db'
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3005,
        DATABASE_PATH: '/home/gazza/bookmarx/src/website/data/bookmarx.db'
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
