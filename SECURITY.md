# Security Policy

## Supported Versions

We actively support the following versions of Ctxman with security updates:

| Version | Supported | End of Support |
|---------|-----------|----------------|
| 3.0.x   | ✅ Active | Current release |
| 2.3.x   | ✅ Maintenance | Until 2025-12-31 |
| < 2.3.0 | ❌ EOL | End of life |

### Version Definitions

- **Active**: Full security updates and bug fixes
- **Maintenance**: Critical security updates only
- **EOL**: No security updates, upgrade recommended

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue, please report it responsibly.

### How to Report

**Preferred Method: GitHub Security Advisories**

1. Go to [GitHub Security Advisories](https://github.com/hakkisagdic/ctxman/security/advisories)
2. Click "Report a vulnerability"
3. Fill out the form with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

**Alternative Methods:**

- Email: Create a GitHub issue with `[SECURITY]` prefix (for non-critical issues)
- For sensitive issues, contact the maintainer directly via GitHub

### What to Include

Please provide:

1. **Description**: Clear description of the vulnerability
2. **Affected Versions**: Which versions are affected
3. **Reproduction**: Steps to reproduce the issue
4. **Impact**: What an attacker could achieve
5. **Proof of Concept**: Code or commands demonstrating the issue (optional)
6. **Suggested Fix**: If you have ideas for fixing it (optional)

### Response Timeline

| Stage | Target Time |
|-------|-------------|
| Initial Response | Within 48 hours |
| Vulnerability Assessment | Within 7 days |
| Fix Development | Varies by severity |
| Security Advisory Published | With the fix release |

### Severity Levels

| Severity | Description | Response Time |
|----------|-------------|---------------|
| **Critical** | Remote code execution, data breach | 24-48 hours |
| **High** | Authentication bypass, privilege escalation | 3-7 days |
| **Medium** | Information disclosure, DoS | 7-14 days |
| **Low** | Minor issues, best practice violations | 14-30 days |

## Security Best Practices

### For Users

1. **Keep Updated**: Always use the latest supported version
2. **Secure Configuration**:
   - Use `--auth-token` when running the API server
   - Don't expose the API server publicly without authentication
   - Review `.contextignore` and `.contextinclude` files before analysis
3. **API Security**:
   - Use HTTPS in production
   - Implement rate limiting
   - Validate all inputs when using programmatically

### For Contributors

1. **Code Review**: All code changes require review
2. **Dependency Updates**: Regular security audits of dependencies
3. **Secure Coding**:
   - Validate all inputs
   - Avoid `eval()` and similar functions
   - Use parameterized queries (if applicable)
   - Sanitize file paths to prevent traversal attacks
   - Handle errors without exposing sensitive information

## Security Features

### Built-in Security

- **Path Validation**: Prevents directory traversal attacks
- **File Type Validation**: Only processes text files, ignores binaries
- **Gitignore Respect**: Honors `.gitignore` rules by default
- **API Authentication**: Optional token-based authentication
- **CORS Support**: Configurable cross-origin policies

### Known Security Considerations

1. **File Access**: Ctxman reads files in the target directory. Ensure you trust the codebase being analyzed.

2. **API Server**: When running `ctxman serve`:
   - Default port is 3000
   - No authentication by default
   - Use `--auth-token` for production

3. **Token Counting**: Uses tiktoken which loads model data from the internet on first run. This is a one-time operation.

## Security Updates

Security updates are announced through:

1. **GitHub Security Advisories**: [View advisories](https://github.com/hakkisagdic/ctxman/security/advisories)
2. **GitHub Releases**: Check release notes for security fixes
3. **npm**: Security updates are published to npm immediately

## Vulnerability Disclosure Policy

We follow responsible disclosure:

1. **Report privately** through GitHub Security Advisories
2. **We investigate** and confirm the vulnerability
3. **We develop a fix** and coordinate with reporter
4. **We release** the fix and publish an advisory
5. **Public disclosure** after the fix is available

### CVE Assignment

For confirmed vulnerabilities, we will:
- Request a CVE from GitHub
- Credit the reporter (unless they wish to remain anonymous)
- Document the vulnerability in the advisory

## Contact

- **Security Issues**: [GitHub Security Advisories](https://github.com/hakkisagdic/ctxman/security/advisories)
- **General Issues**: [GitHub Issues](https://github.com/hakkisagdic/ctxman/issues)
- **Maintainer**: [@hakkisagdic](https://github.com/hakkisagdic)

## Acknowledgments

We thank all security researchers who responsibly report vulnerabilities. Your efforts help keep Ctxman secure for everyone.

---

*Last updated: 2025-08-23*
