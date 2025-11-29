# Production Security Checklist

Before deploying to production:

## Authentication & Authorization
- [ ] Implement proper authentication (JWT/session)
- [ ] Verify token signatures, not just decode
- [ ] Check token expiration
- [ ] Validate all claims
- [ ] Implement role-based or permission-based authorization
- [ ] Use HTTPS/WSS only (never WS/HTTP in production)

## Input Validation
- [ ] Validate all message types
- [ ] Validate all data fields
- [ ] Sanitize user-generated content
- [ ] Enforce length limits
- [ ] Use schema validation (Zod, etc.)

## Rate Limiting
- [ ] Implement per-connection rate limiting
- [ ] Implement per-user rate limiting
- [ ] Limit connections per Actor
- [ ] Handle rate limit errors gracefully

## Security Headers & CORS
- [ ] Validate `Origin` header
- [ ] Set appropriate CORS headers
- [ ] Use secure cookies (httpOnly, secure, sameSite)

## Error Handling
- [ ] Never expose stack traces to clients
- [ ] Log errors server-side
- [ ] Use generic error messages for clients
- [ ] Implement error monitoring (Sentry, etc.)

## Monitoring & Logging
- [ ] Log authentication attempts
- [ ] Log authorization failures
- [ ] Monitor rate limit violations
- [ ] Set up alerts for suspicious activity
- [ ] Track connection counts and patterns

## Data Protection
- [ ] Don't store sensitive data in Actor memory
- [ ] Encrypt sensitive data at rest
- [ ] Use environment variables for secrets
- [ ] Rotate secrets regularly

## Testing
- [ ] Test with invalid tokens
- [ ] Test with expired tokens
- [ ] Test rate limiting
- [ ] Test malicious input
- [ ] Test CSWSH protection

## Related Documentation

- [Authentication](./authentication.md) - Verifying user identity
- [Authorization](./authorization.md) - What users can do
- [Input Validation](./input-validation.md) - Validating user input
- [Rate Limiting](./rate-limiting.md) - Preventing abuse
- [Vulnerabilities](./vulnerabilities.md) - Common security issues

## Questions?

- See [Examples](../examples/README.md) for implementation patterns
- See [API Reference](../api/server.md) for full API documentation
- Check [GitHub Discussions](https://github.com/v0id-user/verani/discussions) for community help

