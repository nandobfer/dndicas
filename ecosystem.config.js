module.exports = {
    apps: [
        {
            name: "dungeons-and-dicas",
            script: "npm",
            args: "start",
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: "512M",
            env: {
                NODE_ENV: "production",
            },
        },
    ],
};
