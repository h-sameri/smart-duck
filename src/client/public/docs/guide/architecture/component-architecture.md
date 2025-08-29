# Component Architecture

## AI Trading Engine (`src/bot/`)

### Core Components
```typescript
// Main Agent class structure
class Agent {
  // AI model configuration
  private ai: GoogleGenAI;
  private model: ModelName;
  
  // Core workflows
  async enhancedWorkflow(userPrompt: string): Promise<WorkflowResult>;
  async promptGuard(prompt: string): Promise<PromptGuardResult>;
  async extractTicker(prompt: string): Promise<TokenExtractionResult>;
  async makeTradeDecision(ticker: string, data: PriceData): Promise<TradeDecision>;
}
```

### Advanced Trading Agent
```typescript
class TradingAgentAdvanced extends Agent {
  // Enhanced analysis capabilities
  async technicalAnalysis(priceHistory: PriceData[]): Promise<TechnicalIndicators>;
  async riskAssessment(trade: TradeDecision): Promise<RiskMetrics>;
  async portfolioOptimization(holdings: Portfolio): Promise<Recommendations>;
}
```

### Market Data System
```typescript
// CoinGecko integration architecture
interface MarketDataSystem {
  // Price history management
  getPriceHistory(symbol: string, days: number): Promise<PriceHistoryResult>;
  
  // Caching system
  getCachedData(symbol: string): PriceHistoryResult | null;
  setCachedData(symbol: string, data: PriceHistoryResult): void;
  
  // Background updates
  warmEssentialCache(): Promise<void>;
  backgroundFetchQueue: Set<string>;
}
```

## Smart Contract Architecture

### CaretOrchestrator Contract
```solidity
contract CaretOrchestrator {
    // State variables
    address public server;
    IERC20 public usdt;
    mapping(uint256 => address[]) public actors;
    mapping(address => bool) public isActor;
    mapping(address => address) public escrows;
    mapping(string => address) public tokens;
    
    // Core functions
    function registerActor(uint256 owner_, address actor_) external onlyServer;
    function registerToken(string memory name, string memory symbol) external onlyServer;
    
    // Access control
    modifier onlyServer() {
        require(msg.sender == server, "Not the server");
        _;
    }
}
```

### CaretEscrow Contract
```solidity
contract CaretEscrow {
    // State management
    address public actor;
    CaretOrchestrator public orchestrator;
    
    // Fund management
    function balance(address token_) external view returns (uint256);
    function releaseFunds(address token_, address to_, uint256 amount_) external onlyServer;
    function fundActor(address token_, uint256 amount_) external onlyActor;
    
    // Security modifiers
    modifier onlyServer();
    modifier onlyActor();
}
```

## Server Core Architecture

### Request Processing Pipeline
```typescript
// Server request handler
export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    
    // Route handling
    switch (url.pathname) {
      case "/health": return healthCheck();
      case "/tnc": return renderTerms();
      case "/api/ping": return apiPing();
      default: return notFound();
    }
  }
}
```

### Database Schema
```sql
-- Core tables
CREATE TABLE user_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  agent_name TEXT NOT NULL UNIQUE,
  escrow_address TEXT NOT NULL,
  actor_address TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE trade_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  token_symbol TEXT NOT NULL,
  trade_type TEXT NOT NULL, -- 'BUY' or 'SELL'
  amount DECIMAL(18,8) NOT NULL,
  price DECIMAL(18,8) NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tx_hash TEXT,
  FOREIGN KEY (agent_id) REFERENCES user_agents(id)
);

CREATE TABLE market_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_symbol TEXT NOT NULL,
  condition_type TEXT NOT NULL, -- 'PRICE_ABOVE', 'PRICE_BELOW', etc.
  threshold_value DECIMAL(18,8) NOT NULL,
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Component Interactions

### AI Engine Integration
- **Input Processing**: Handles natural language queries
- **Market Data**: Fetches and caches price information
- **Analysis Pipeline**: Processes data through AI models
- **Response Generation**: Formats results for user consumption

### Smart Contract Integration
- **Agent Registration**: Creates new trading agents
- **Fund Management**: Handles escrow operations
- **Trade Execution**: Submits transactions to blockchain
- **Balance Tracking**: Monitors agent balances

### Database Integration
- **User Management**: Stores user and agent information
- **Trade History**: Records all trading activities
- **Market Alerts**: Manages price alert configurations
- **Performance Tracking**: Tracks trading performance metrics

## Modularity Benefits

### Independent Development
- **Parallel Development**: Teams can work on different components
- **Technology Flexibility**: Each component can use optimal technology
- **Testing Isolation**: Components can be tested independently

### Scalability
- **Component Scaling**: Individual components can be scaled as needed
- **Resource Optimization**: Efficient resource allocation per component
- **Load Distribution**: Better handling of varying load patterns

### Maintenance
- **Easier Debugging**: Issues can be isolated to specific components
- **Simplified Updates**: Components can be updated independently
- **Reduced Complexity**: Smaller, focused codebases
