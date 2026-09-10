export type AgentStudioWorkerToolMethod = 'GET' | 'POST';

export interface AgentStudioWorkerJsonSchema {
  type: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';
  description?: string;
  properties?: Record<string, AgentStudioWorkerJsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: AgentStudioWorkerJsonSchema;
  enum?: Array<string | number | boolean>;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
}

export interface AgentStudioWorkerTool {
  id: string;
  name: string;
  description: string;
  method: AgentStudioWorkerToolMethod;
  path: string;
  inputSchema: AgentStudioWorkerJsonSchema;
}

const string = (
  description: string,
  options: Partial<AgentStudioWorkerJsonSchema> = {},
): AgentStudioWorkerJsonSchema => ({ type: 'string', description, ...options });

const integer = (
  description: string,
  options: Partial<AgentStudioWorkerJsonSchema> = {},
): AgentStudioWorkerJsonSchema => ({
  type: 'integer',
  description,
  ...options,
});

const boolean = (description: string): AgentStudioWorkerJsonSchema => ({
  type: 'boolean',
  description,
});

const object = (
  properties: Record<string, AgentStudioWorkerJsonSchema>,
  required: string[] = [],
): AgentStudioWorkerJsonSchema => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
});

const array = (
  items: AgentStudioWorkerJsonSchema,
  options: Partial<AgentStudioWorkerJsonSchema> = {},
): AgentStudioWorkerJsonSchema => ({ type: 'array', items, ...options });

const chainId = string(
  'Binance Web3 chain identifier, for example 56 for BSC.',
);
const tokenAddress = string(
  'Token contract address recognized by Binance Web3 on the selected chain.',
);

const tokenBatchBody = array(
  object(
    {
      binanceChainId: chainId,
      tokenContractAddress: tokenAddress,
    },
    ['binanceChainId', 'tokenContractAddress'],
  ),
  { minItems: 1, maxItems: 100 },
);

const marketQuery = object(
  {
    binanceChainId: chainId,
    tokenContractAddress: tokenAddress,
  },
  ['binanceChainId', 'tokenContractAddress'],
);

const getTool = (
  id: string,
  name: string,
  description: string,
  path: string,
  query: AgentStudioWorkerJsonSchema,
): AgentStudioWorkerTool => ({
  id,
  name,
  description,
  method: 'GET',
  path,
  inputSchema: object({ query }, ['query']),
});

const postTool = (
  id: string,
  name: string,
  description: string,
  path: string,
  body: AgentStudioWorkerJsonSchema,
): AgentStudioWorkerTool => ({
  id,
  name,
  description,
  method: 'POST',
  path,
  inputSchema: object({ body }, ['body']),
});

export const AGENT_STUDIO_BINANCE_WEB3_TOOLS = [
  postTool(
    'getTokenPrice',
    'binance_get_token_price',
    'Get current token prices for up to 100 chain and contract pairs.',
    '/api/v1/dex/market/price',
    tokenBatchBody,
  ),
  postTool(
    'getTokenTradingInfo',
    'binance_get_token_trading_info',
    'Get token market statistics such as price changes, volume, liquidity, and holder activity.',
    '/api/v1/dex/market/price-info',
    tokenBatchBody,
  ),
  getTool(
    'getTokenTrades',
    'binance_get_token_trades',
    'Get recent decentralized-exchange trades for one token.',
    '/api/v1/dex/market/trades',
    object(
      {
        binanceChainId: chainId,
        tokenContractAddress: tokenAddress,
        cursor: string('Pagination cursor returned by a previous response.'),
        limit: integer('Maximum number of trades to return.', {
          minimum: 1,
          maximum: 500,
        }),
        tagFilter: integer('Optional Binance Web3 trade tag filter.', {
          minimum: 1,
          maximum: 7,
        }),
        walletAddressFilter: string('Optional wallet address filter.'),
      },
      ['binanceChainId', 'tokenContractAddress'],
    ),
  ),
  getTool(
    'getCandles',
    'binance_get_candles',
    'Get OHLCV candlesticks for one token.',
    '/api/v1/dex/market/candles',
    object(
      {
        binanceChainId: chainId,
        tokenContractAddress: tokenAddress,
        bar: string('Candle interval.', {
          enum: [
            '1s',
            '5s',
            '30s',
            '1m',
            '3m',
            '5m',
            '15m',
            '30m',
            '1h',
            '2h',
            '4h',
            '6h',
            '8h',
            '12h',
            '1d',
            '3d',
            '1w',
            '1M',
          ],
        }),
        after: integer(
          'Return candles earlier than this Unix millisecond timestamp.',
          {
            minimum: 0,
          },
        ),
        before: integer(
          'Return candles later than this Unix millisecond timestamp.',
          {
            minimum: 0,
          },
        ),
        limit: integer('Maximum number of candles to return.', {
          minimum: 1,
          maximum: 500,
        }),
      },
      ['binanceChainId', 'tokenContractAddress'],
    ),
  ),
  getTool(
    'getTopLiquidityPools',
    'binance_get_top_liquidity_pools',
    'Get the top liquidity pools and protocol composition for one token.',
    '/api/v1/dex/market/token/top-liquidity',
    marketQuery,
  ),
  getTool(
    'getAggregatedQuote',
    'binance_get_aggregated_quote',
    'Get read-only swap route quotes. Amount must use the source token smallest unit. This tool never submits a transaction.',
    '/api/v1/dex/aggregator/quote',
    object(
      {
        binanceChainId: chainId,
        amount: string('Source token amount in the smallest unit.', {
          pattern: '^\\d+$',
        }),
        fromTokenAddress: string('Source token contract address.'),
        toTokenAddress: string('Destination token contract address.'),
        vendor: string('Optional quote vendor.', {
          enum: ['LiquidMesh', 'Pancake', 'Jupiter'],
        }),
        userWalletAddress: string(
          'Optional wallet address used only for quote calculation.',
        ),
      },
      ['binanceChainId', 'amount', 'fromTokenAddress', 'toTokenAddress'],
    ),
  ),
  getTool(
    'getAllTokenBalancesByAddress',
    'binance_get_wallet_token_balances',
    'Get token balances for a wallet. Risk tokens should normally remain excluded.',
    '/api/v1/dex/balance/all-token-balances-by-address',
    object(
      {
        address: string('Wallet address to inspect.'),
        chains: string('One Binance Web3 chain identifier.'),
        excludeRiskToken: boolean(
          'Exclude tokens Binance Web3 marks as risky.',
        ),
        page: integer('Page number.', { minimum: 1 }),
        pageSize: integer('Number of balances per page.', {
          minimum: 1,
          maximum: 100,
        }),
      },
      ['address', 'chains'],
    ),
  ),
  getTool(
    'getGasPrice',
    'binance_get_gas_price',
    'Get current gas price information for a chain.',
    '/api/v1/dex/pre-transaction/gas-price',
    object({ binanceChainId: chainId }, ['binanceChainId']),
  ),
  postTool(
    'getDeFiPositions',
    'binance_get_defi_positions',
    'Get protocol-level DeFi position summaries for up to three wallet addresses.',
    '/api/v1/defi/data/position/list',
    object(
      {
        addresses: array(string('Wallet address.'), {
          minItems: 1,
          maxItems: 3,
        }),
        binanceChainIds: array(chainId, { minItems: 1, maxItems: 3 }),
      },
      ['addresses'],
    ),
  ),
  postTool(
    'listDeFiProtocols',
    'binance_list_defi_protocols',
    'List DeFi protocols with TVL, APY, and investment type filters.',
    '/api/v1/defi/data/protocol/list',
    object({
      page: integer('Page number.', { minimum: 1 }),
      size: integer('Page size.', { minimum: 1, maximum: 200 }),
      sortField: string('Sort field.', { enum: ['tvl', 'apy'] }),
      sortDirection: string('Sort direction.', { enum: ['ASC', 'DESC'] }),
      investType: string('Investment category.', {
        enum: ['Earn', 'LiquidityPool'],
      }),
      binanceChainId: chainId,
    }),
  ),
  postTool(
    'listDeFiInvestments',
    'binance_list_defi_investments',
    'List DeFi investment opportunities with APY, TVL, protocol, and token filters.',
    '/api/v1/defi/data/investment/list',
    object(
      {
        investType: string('Investment category.', {
          enum: ['Earn', 'LiquidityPool'],
        }),
        page: integer('Page number.', { minimum: 1 }),
        size: integer('Page size.', { minimum: 1, maximum: 100 }),
        sortField: string('Sort field.', { enum: ['tvl', 'apy'] }),
        sortDirection: string('Sort direction.', { enum: ['ASC', 'DESC'] }),
        binanceChainId: chainId,
        defiProtocolId: string('Optional Binance Web3 DeFi protocol id.'),
        tokenAddressList: array(tokenAddress, { minItems: 1, maxItems: 20 }),
      },
      ['investType'],
    ),
  ),
  postTool(
    'getProtocolDetail',
    'binance_get_defi_protocol_detail',
    'Get DeFi protocol metadata, security scores, team, social links, and fundraising details.',
    '/api/v1/defi/data/protocol/detail',
    object({ defiProtocolId: string('Binance Web3 DeFi protocol id.') }, [
      'defiProtocolId',
    ]),
  ),
  postTool(
    'getInvestmentDetail',
    'binance_get_defi_investment_detail',
    'Get APY, TVL, supported assets, pool address, fee rate, rewards, and investability for a DeFi investment.',
    '/api/v1/defi/data/investment/detail',
    object(
      {
        investmentId: string(
          '64-character Binance Web3 investment id without a 0x prefix.',
          {
            pattern: '^[A-Fa-f0-9]{64}$',
          },
        ),
      },
      ['investmentId'],
    ),
  ),
] as const satisfies readonly AgentStudioWorkerTool[];

const toolsById = new Map(
  AGENT_STUDIO_BINANCE_WEB3_TOOLS.map((tool) => [tool.id, tool]),
);

export function resolveAgentStudioBinanceWeb3Tool(
  id: string,
): AgentStudioWorkerTool | null {
  const tool = toolsById.get(id);
  return tool ? structuredClone(tool) : null;
}

export const AGENT_STUDIO_BINANCE_WEB3_ALLOWED_REQUESTS =
  AGENT_STUDIO_BINANCE_WEB3_TOOLS.map(({ id, method, path }) => ({
    id,
    method,
    path,
  }));
