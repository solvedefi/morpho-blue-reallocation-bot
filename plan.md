# AWS Secrets Manager Migration Implementation Plan

## Overview
This plan outlines the migration from .env file-based secret management to AWS Secrets Manager for the Morpho Blue Reallocation Bot. The current system manages secrets for 9 blockchain networks with chain-specific configuration.

## Current State Analysis

### Environment Variables Used
The codebase uses a pattern-based approach for environment variables, organized by blockchain network chain IDs:

**Per-Chain Environment Variables:**
- `RPC_URL_{chainId}` - RPC endpoint URLs for each blockchain network
- `REALLOCATOR_PRIVATE_KEY_{chainId}` - Private keys for the reallocator wallet on each chain
- `VAULT_WHITELIST_{chainId}` - Comma-separated list of vault addresses to monitor
- `EXECUTION_INTERVAL_{chainId}` - Bot execution interval in seconds for each chain

**Database Configuration:**
- `POSTGRES_DATABASE_URL` - PostgreSQL connection string for Ponder indexer

**Supported Chain IDs:**
- `1` (Ethereum Mainnet)
- `8453` (Base)
- `130` (Unichain) 
- `747474` (Custom chain)
- `137` (Polygon)
- `1135` (Lisk)
- `98866` (Custom chain)
- `1868` (Soneium)
- `239` (Custom chain)
- `480` (Worldchain)
- `42161` (Arbitrum)

### Current Configuration System
- Centralized configuration in `/apps/config/src/index.ts`
- TypeScript interfaces for type safety
- Runtime validation for required variables
- No existing AWS SDK integration

## Implementation Plan

### Phase 1: Infrastructure Setup

1. **Install AWS SDK Dependencies**
   - Add `@aws-sdk/client-secrets-manager` to config package
   - Add AWS credential dependencies if needed
   - Update package.json in `/apps/config/`

2. **AWS Configuration**
   - Set up AWS credentials (IAM role, access keys, or instance profile)
   - Create secrets in AWS Secrets Manager with proper naming convention
   - Configure AWS region settings
   - Create least-privilege IAM policies for secret access

### Phase 2: Secret Organization Strategy

**Recommended Secret Structure in AWS Secrets Manager:**

```json
{
  "morpho-reallocation-bot/database": {
    "POSTGRES_DATABASE_URL": "postgresql://..."
  },
  "morpho-reallocation-bot/chains": {
    "1": {
      "RPC_URL": "https://...",
      "REALLOCATOR_PRIVATE_KEY": "0x...",
      "VAULT_WHITELIST": "0x...,0x...",
      "EXECUTION_INTERVAL": "3600"
    },
    "8453": {
      "RPC_URL": "https://...",
      "REALLOCATOR_PRIVATE_KEY": "0x...",
      "VAULT_WHITELIST": "0x...,0x...",
      "EXECUTION_INTERVAL": "3600"
    }
    // ... other chains (130, 747474, 137, 1135, 98866, 1868, 239, 480, 42161)
  }
}
```

**Alternative: Individual Secrets per Chain**
- `morpho-reallocation-bot/chain-1`
- `morpho-reallocation-bot/chain-8453`
- `morpho-reallocation-bot/database`

### Phase 3: Code Implementation

1. **Update Config Package** (`apps/config/src/index.ts`)
   - Create AWS Secrets Manager client
   - Add `getSecretsFromAWS()` function alongside existing `getSecrets()`
   - Implement caching layer for secrets (reduce API calls and costs)
   - Add fallback mechanism to .env for local development
   - Update TypeScript interfaces to support both sources

2. **Environment Detection**
   - Add `USE_AWS_SECRETS` environment variable flag
   - Local development: use .env files (default)
   - Production/staging: use AWS Secrets Manager
   - Docker: configurable via environment variable

3. **Error Handling & Retry Logic**
   - Handle AWS API errors gracefully
   - Implement exponential backoff retry mechanism
   - Fallback to cached values if AWS is temporarily unavailable
   - Comprehensive logging for debugging

4. **Caching Strategy**
   - In-memory cache with TTL (Time To Live)
   - Periodic refresh in background
   - Cache invalidation strategies
   - Reduced AWS API calls for cost optimization

### Phase 4: Migration Strategy

1. **Dual Support Phase**
   - Support both .env and AWS Secrets Manager simultaneously
   - Use feature flag (`USE_AWS_SECRETS`) to control source
   - Maintain full backward compatibility
   - No breaking changes to existing functionality

2. **Gradual Migration Approach**
   ```
   Stage 1: Non-critical secrets (execution intervals, vault whitelists)
   Stage 2: Infrastructure secrets (RPC URLs, database connections)
   Stage 3: Sensitive secrets (private keys) - most critical
   ```

3. **Testing Strategy**
   - Test each chain configuration independently
   - Validate secret retrieval for all 11 chains
   - Compare .env vs AWS Secrets Manager outputs
   - Load testing for multiple concurrent requests

### Phase 5: Security Enhancements

1. **Access Control**
   - Create least-privilege IAM policies
   - Separate secrets for different environments (dev/staging/prod)
   - Implement secret rotation policies
   - Use AWS IAM roles instead of access keys where possible

2. **Monitoring & Logging**
   - Add CloudWatch metrics for secret access
   - Log secret retrieval attempts (without exposing values)
   - Set up alerts for failed secret retrievals
   - Monitor API usage and costs

3. **Secret Rotation**
   - Implement automatic secret rotation for private keys
   - Set up rotation schedules
   - Handle rotation gracefully in application

### Phase 6: Deployment & Operations

1. **Docker Integration**
   - Update docker-compose.yml with AWS configuration
   - Add AWS credential mounting or IAM role assignment
   - Environment-specific configuration

2. **CI/CD Updates**
   - Update deployment scripts
   - Add AWS permissions to deployment pipeline
   - Secret validation in CI/CD

3. **Documentation Updates**
   - Update README with AWS setup instructions
   - Document environment variables
   - Create troubleshooting guide

## Implementation Priority

### Critical Priority (Phase 1)
- Private keys (`REALLOCATOR_PRIVATE_KEY_{chainId}`)
- Database credentials (`POSTGRES_DATABASE_URL`)

### High Priority (Phase 2)
- RPC URLs (`RPC_URL_{chainId}`)
- Infrastructure configuration

### Medium Priority (Phase 3)
- Vault whitelists (`VAULT_WHITELIST_{chainId}`)
- Execution intervals (`EXECUTION_INTERVAL_{chainId}`)

## Risk Mitigation

1. **Fallback Mechanisms**
   - Always maintain .env support for development
   - Graceful degradation if AWS is unavailable
   - Local caching for resilience

2. **Testing Strategy**
   - Comprehensive unit tests for secret retrieval
   - Integration tests with AWS Secrets Manager
   - Load testing for production scenarios

3. **Monitoring**
   - Health checks for secret retrieval
   - Cost monitoring for AWS API usage
   - Performance monitoring for latency impact

## Success Criteria

- [ ] All secrets successfully migrated to AWS Secrets Manager
- [ ] Zero downtime during migration
- [ ] Backward compatibility maintained for development
- [ ] Security improved with proper access controls
- [ ] Monitoring and alerting in place
- [ ] Documentation updated and complete
- [ ] Cost optimization through caching implemented