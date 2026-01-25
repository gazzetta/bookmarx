```markdown
# BookMarx Technical Stack Details

## Core Technologies

### Backend Stack
```typescript
interface TechnicalStack {
    language: "Node.js/TypeScript";
    framework: "Express.js";
    reasons: [
        "Lightweight and flexible",
        "Fast development cycle",
        "Rich ecosystem of libraries",
        "Simple routing and middleware",
        "WebSocket support for real-time sync",
        "Strong community support"
    ];
}
```

### Frontend Stack
```typescript
interface FrontendStack {
    framework: "React with Next.js";
    ui: "shadcn/ui with Tailwind CSS";
    reasons: [
        "Modern React features",
        "Server-side rendering",
        "Built-in routing",
        "Pre-built UI components",
        "Responsive design",
        "Great developer experience"
    ];
}
```

### Extension Stack
```typescript
interface ExtensionStack {
    language: "TypeScript";
    apis: [
        "Chrome Extension APIs",
        "Browser Storage API",
        "Bookmarks API"
    ];
    reasons: [
        "Type safety",
        "Direct browser integration",
        "Simple deployment",
        "Clean separation from website"
    ];
}
```

### Database Choice
```typescript
interface DatabaseChoice {
    type: "PostgreSQL";
    reasons: [
        "ACID compliance for critical data",
        "Strong data integrity",
        "Complex query support",
        "JSON support for flexible data",
        "Excellent indexing capabilities",
        "Mature and reliable"
    ];
    usage: [
        "User accounts",
        "Authentication data",
        "Bookmark storage",
        "Sync metadata",
        "Payment records",
        "Backup management"
    ];
}
```

### Server Infrastructure
```typescript
interface ServerInfrastructure {
    provider: "Hetzner";
    os: "Ubuntu 22.04 LTS";
    configuration: {
        recommended: "CPX41";
        specs: {
            cpu: "8 vCPU";
            ram: "16 GB";
            storage: "240 GB SSD";
            cost: "€28.88/month";
        };
    };
}
```

## Development Tools

### Version Control & CI/CD
- Git for version control
- GitHub Actions for CI/CD
- Automated testing and deployment

### Development Environment
```typescript
interface DevEnvironment {
    local: {
        docker: {
            services: [
                "PostgreSQL",
                "Development server",
                "Test environment"
            ];
        };
        tools: [
            "VS Code",
            "Postman",
            "pgAdmin",
            "Chrome DevTools"
        ];
    };
    testing: {
        unit: "Jest";
        integration: "Supertest";
        e2e: "Playwright";
    };
}
```

## Extension Development
```typescript
interface ExtensionTools {
    build: {
        bundler: "Webpack";
        configuration: "Custom for extension";
        features: [
            "Hot reloading",
            "Source maps",
            "Asset optimization"
        ];
    };
    testing: {
        tools: [
            "Jest for unit tests",
            "Chrome Extension testing tools",
            "Browser-specific testing"
        ];
    };
}
```

## Security Implementation
```typescript
interface SecurityStack {
    authentication: {
        jwt: "JSON Web Tokens";
        oauth: ["Google", "Apple", "Facebook"];
        encryption: "AES-256-GCM";
    };
    ssl: {
        provider: "Let's Encrypt";
        automation: "Certbot";
    };
    dataProtection: {
        hashing: "bcrypt";
        encryption: "AES-256";
    };
}
```

## Monitoring & Logging
```typescript
interface MonitoringStack {
    system: {
        tool: "Netdata";
        metrics: [
            "CPU usage",
            "Memory",
            "Disk I/O",
            "Network"
        ];
    };
    logging: {
        tool: "Promtail + Loki";
        retention: "30 days";
    };
}
```

## Optimization Features
- Server-side caching
- Response compression
- Static asset optimization
- Database query optimization
- Connection pooling

## Scalability Considerations
- Horizontal scaling capability
- Load balancing readiness
- Database replication support
- Caching layer addition
- MongoDB/Redis future integration

## Backup Strategy
```typescript
interface BackupStrategy {
    database: {
        tool: "pg_dump";
        frequency: "daily";
        retention: "30 days";
    };
    userFiles: {
        primary: "Local storage";
        secondary: "Wasabi/BackBlaze B2";
    };
}
```

This technical stack is designed for:
1. Reliable performance
2. Cost-effective scaling
3. Easy maintenance
4. Strong security
5. Developer productivity

Future considerations include:
- Redis for caching
- MongoDB for bookmark data
- CDN integration
- Kubernetes deployment
```