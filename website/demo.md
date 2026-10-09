# Interactive Demo

Try Ctxman directly in your browser! This interactive demo lets you experience the core features of Ctxman without installing anything.

<InteractiveDemo />

## How It Works

1. **Select a Language**: Choose from JavaScript, TypeScript, Python, or Rust
2. **View Sample Code**: See example code in the selected language
3. **Run Analysis**: Click the "Run Analysis" button to see how Ctxman processes the code
4. **View Results**: See the token count, method analysis, and summary

## Live Features

### Token Analysis

Ctxman counts tokens with tiktoken, using the encoding of the model you target:

- **Exact for OpenAI models**, marked approximate for models with their own tokenizer
- **Per-File Breakdown**: See tokens for each file
- **Method-Level**: Drill down to individual functions

### Method Detection

See how Ctxman identifies and analyzes individual methods:

- **Function Names**: Extract method names
- **Token per Method**: Count tokens for each method
- **Complexity Insights**: Understand code structure

### Multi-Language Support

Ctxman supports 14+ programming languages with full AST analysis:

- JavaScript / TypeScript
- Python
- PHP
- Ruby
- Java / Kotlin
- C# / Go / Rust
- Swift / C / C++
- Scala

## Try It Yourself

### Install Ctxman

```bash
npm install -g ctxman
```

### Run Analysis

```bash
# Navigate to your project
cd your-project

# Run Ctxman
ctxman
```

### CLI Mode

For quick analysis without the wizard:

```bash
ctxman --cli --method-level
```

### Watch Mode

For real-time analysis:

```bash
ctxman watch
```

### API Server

For programmatic access:

```bash
ctxman serve
```

## Example Outputs

### TOON Format

40-50% token reduction for LLM optimization:

````markdown
# src/index.js

## Functions

### calculateSum(arr)

```javascript
return arr.reduce((sum, num) => sum + num, 0);
```
````

Tokens: 45

### main()

```javascript
const numbers = [1, 2, 3, 4, 5];
console.log(calculateSum(numbers));
```

Tokens: 32

`````

### GitIngest Format

GitHub-ready markdown with syntax highlighting:

````markdown
# Project Analysis

## File Tree

`````

src/
├── index.js
├── utils.js
└── parser.js

````

## Files

### src/index.js

```javascript
// Example JavaScript code
function calculateSum(arr) {
  return arr.reduce((sum, num) => sum + num, 0);
}
````

````

### JSON Format

Machine-readable for automation:

```json
{
  "totalTokens": 245,
  "totalFiles": 1,
  "files": [
    {
      "path": "example.js",
      "tokens": 245,
      "lines": 8,
      "methods": [
        {
          "name": "calculateSum",
          "tokens": 45
        }
      ]
    }
  ]
}
```

## What's Next?

Ready to use Ctxman in your projects?

1. **[Get Started](/getting-started)** - Full installation guide
2. **[Features](/features)** - Explore all capabilities
3. **[API Reference](/api-reference)** - Complete documentation
4. **[GitHub](https://github.com/hakkisagdic/ctxman)** - Source code and issues

<script setup>
import InteractiveDemo from './.vitepress/components/InteractiveDemo.vue'
</script>
````
