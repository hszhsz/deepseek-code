# deepseek-code

An AI coding agent optimized for DeepSeek models, built on top of [opencode](https://github.com/anomalyco/opencode).

> **Note**: This is an independent community project, not affiliated with or endorsed by DeepSeek or the opencode team.

## Features

- **DeepSeek-native**: Optimized prompts and configurations for DeepSeek V4 Pro and V4 Flash models
- **Smart model routing**: Automatically selects between V4 Pro (complex tasks) and V4 Flash (fast/cheap tasks)
- **1M context window**: Leverages DeepSeek's ultra-long context for whole-project analysis
- **FIM code completion**: Integrated Fill-in-the-Middle completion powered by DeepSeek
- **Deep reasoning**: Native support for DeepSeek's thinking/reasoning mode with configurable effort levels
- **Cost optimization**: Context caching awareness to minimize API costs
- **Bilingual**: Native Chinese and English support
- **Full opencode compatibility**: All opencode features, tools, and plugins work out of the box

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime
- A DeepSeek API key from [platform.deepseek.com](https://platform.deepseek.com)

### Installation

```bash
# Clone the repository
git clone https://github.com/hszhsz/deepseek-code.git
cd deepseek-code

# Install dependencies
bun install

# Set your DeepSeek API key
export DEEPSEEK_API_KEY="sk-your-key-here"

# Run in development mode
bun run dev
```

## Configuration

Create a `.deepseek-code/config.jsonc` file in your project root:

```jsonc
{
  "provider": {
    "deepseek": {
      "name": "DeepSeek",
      "options": {
        "apiKey": "${DEEPSEEK_API_KEY}"
      }
    }
  },
  "model": "deepseek/deepseek-v4-pro"
}
```

### Model Selection

| Model | Best For | Cost (per 1M tokens) |
|---|---|---|
| `deepseek-v4-pro` | Complex refactoring, architecture, debugging | $0.435 input / $0.87 output |
| `deepseek-v4-flash` | Quick edits, search, planning | $0.14 input / $0.28 output |

### Agents

deepseek-code includes the following agents (switch with Tab):

- **build** (default): Full-access agent for development work, uses V4 Pro
- **plan**: Read-only agent for analysis and code exploration, uses V4 Flash
- **complete**: FIM-based code completion agent, uses V4 Flash

## Architecture

```
deepseek-code (fork of opencode)
├── DeepSeek Provider Layer     # Native DeepSeek API integration
├── Smart Model Router          # Auto-selects Pro vs Flash
├── DeepSeek System Prompts     # Optimized for DeepSeek models
├── FIM Completion Tool         # Fill-in-the-Middle code completion
├── Context Management          # 1M window optimization
└── All opencode features       # Tools, TUI, plugins, MCP, etc.
```

## Key Differences from opencode

| Feature | opencode | deepseek-code |
|---|---|---|
| Model support | 20+ providers | DeepSeek-focused |
| System prompts | Generic | DeepSeek-optimized |
| Context strategy | 128K-200K window | 1M window with cache awareness |
| Code completion | Chat only | Chat + FIM |
| Default language | English | Bilingual (CN/EN) |
| Cost optimization | None | Smart routing + caching |

## Development

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Type checking
bun run typecheck

# Build
bun run build
```

## Acknowledgments

- [opencode](https://github.com/anomalyco/opencode) - The open source coding agent that this project is built upon
- [DeepSeek](https://deepseek.com) - For their excellent AI models

## License

MIT License - see [LICENSE](LICENSE) for details.

This project is a fork of opencode, which is also MIT licensed.
