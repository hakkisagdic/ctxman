# Technical Proposal: Data Source Plugin Architecture

## 1. Overview

The current `ContextManager` supports `LanguagePlugin` (for parsing code) and `ExporterPlugin` (for formatting output). To extend capabilities to ingest external knowledge (e.g., Slack conversations, Jira tickets, Linear issues), we propose adding a new plugin category: **Data Source Plugins**.

This document outlines the architectural changes required to support these plugins, including a new base class, updates to the `PluginManager`, and the data ingestion lifecycle.

## 2. Current Architecture

- **PluginManager**: Generic loader that scans directories and lazy-loads classes.
- **LanguagePlugin**: Base class for code analysis.
- **ExporterPlugin**: Base class for output formatting.
- **Discovery**: Scans `./lib/languages` and `./lib/exporters`.

## 3. Proposed Architecture

### 3.1 New `DataSourcePlugin` Base Class

We will introduce a `DataSourcePlugin` class that defines the contract for external data providers.

**Key Responsibilities:**

- **Authentication**: Handling API keys or OAuth tokens.
- **Fetching**: Retrieving data based on queries or filters.
- **Normalization**: Converting external API responses into a standard `ContextItem` format (uniform structure for the context manager).
- **Validation**: Verifying if a query is supported.

**Interface Definition:**

```javascript
class DataSourcePlugin {
  constructor() {
    this.type = 'datasource';
    this.name = 'base-source';
  }

  /**
   * Configure the plugin with credentials/settings
   * @param {object} config - { apiKey, baseUrl, ... }
   */
  configure(config) {
    this.config = config;
    this.validateConfig();
  }

  /**
   * Fetch data from the source
   * @param {object} query - { types: ['issue'], limit: 10, query: "search term" }
   * @returns {Promise<Array<ContextItem>>}
   */
  async fetch(query) {
    throw new Error('Not implemented');
  }

  /**
   * Test the connection
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    return false;
  }

  /**
   * Normalize external data to standard format
   * @param {object} rawData
   * @returns {ContextItem}
   */
  normalize(rawData) {
    return {
      id: rawData.id,
      content: rawData.text,
      metadata: { source: this.name, ... }
    };
  }
}
```

### 3.2 PluginManager Enhancements

To support the new plugin type effectively, `PluginManager.js` needs the following updates:

1.  **Expanded Discovery**:
    - Add `./lib/sources` (or `./lib/datasources`) to the default `pluginPaths`.
    - Allow plugins to self-identify their `type` (language, exporter, datasource) in `getMetadata()`.

2.  **Configuration Injection**:
    - Currently, plugins are instantiated with no arguments.
    - Add a `configure(pluginName, config)` method to the manager that looks up a loaded plugin and calls its `configure()` method.

3.  **Type-Based Retrieval**:
    - Add `getPluginsByType(type)` to easily retrieve all "datasource" plugins for UI lists or automated fetching.

### 3.3 Data Ingestion Flow

1.  **Registration**: `PluginManager` discovers `JiraPlugin` in `./lib/sources`.
2.  **Configuration**: System (or user) calls `pluginManager.configure('jira', { apiKey: '...' })`.
3.  **Request**: User asks: "Summarize recent bugs."
4.  **Resolution**: The Context Agent identifies "bugs" as a Jira-related query.
5.  **Execution**: Agent calls `pluginManager.get('jira').fetch({ type: 'bug', limit: 5 })`.
6.  **Normalization**: The plugin converts Jira JSON into text/markdown `ContextItems`.
7.  **Integration**: Items are added to the prompt context.

## 4. Implementation Plan

### Phase 1: Core Framework

1.  Create `projects/ctxman/lib/plugins/DataSourcePlugin.js`.
2.  Update `PluginManager.js` to include `./lib/datasources` in default paths.
3.  Add `getPluginsByType()` and `configurePlugin()` methods to `PluginManager`.

### Phase 2: Reference Implementation

1.  Create a `MockSourcePlugin` for testing.
2.  Implement a real `LinearPlugin` or `JiraPlugin` (if credentials available) or a generic `HttpSourcePlugin`.

### Phase 3: Integration

1.  Update the main Ctxman logic to allow querying data sources alongside file reading.

## 5. Example: Linear Plugin

```javascript
class LinearPlugin extends DataSourcePlugin {
  constructor() {
    super();
    this.name = 'linear';
  }

  async fetch({ query, limit = 5 }) {
    const response = await axios.post(
      'https://api.linear.app/graphql',
      {
        query: `query { issueSearch(query: "${query}", first: ${limit}) { nodes { title description url } } }`,
      },
      {
        headers: { Authorization: this.config.apiKey },
      }
    );

    return response.data.data.issueSearch.nodes.map((issue) => this.normalize(issue));
  }

  normalize(issue) {
    return {
      source: 'linear',
      title: issue.title,
      content: `${issue.title}\n${issue.description}\nURL: ${issue.url}`,
    };
  }
}
```

## 6. Security Considerations

- **Credential Storage**: `PluginManager` should not store secrets persistently in plain text. Credentials should be passed in at runtime or managed via environment variables.
- **Sanitization**: Data sources might return sensitive info. Plugins should implement a `redact` or `filter` step if necessary.
