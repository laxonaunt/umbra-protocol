import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { ADDRESSES, ABIS, RPC_URL } from '../lib/contracts'
import Footer from '../components/Footer'

function GlowPrice({ value, loading }) {
  return (
    <span
      className={`font-mono font-semibold text-lg transition-all ${
        loading
          ? 'text-[#333]'
          : 'text-[#4f6ef7]'
      }`}
      style={!loading ? { textShadow: '0 0 18px rgba(79,110,247,0.5)' } : {}}
    >
      {loading ? '—' : value}
    </span>
  )
}

function TerminalRow({ label, value, href, loading, glow }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b border-[#111]">
      <span className="text-xs text-[#555] font-mono">{label}</span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-mono text-[#4f6ef7] hover:underline"
        >
          {value}
        </a>
      ) : glow ? (
        <GlowPrice value={value} loading={loading} />
      ) : (
        <span className="text-xs font-mono text-white">{loading ? '—' : value}</span>
      )}
    </div>
  )
}

function StatusDot({ active }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${active ? 'bg-green-500' : 'bg-[#333]'}`}
        style={active ? { boxShadow: '0 0 6px rgba(74,222,128,0.8)' } : {}}
      />
      <span className="text-xs text-[#555] font-mono">
        {active ? 'LIVE' : 'LOADING'}
      </span>
    </span>
  )
}

export default function Markets() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [ts,      setTs]      = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const provider = new ethers.JsonRpcProvider(RPC_URL)
        const vault    = new ethers.Contract(ADDRESSES.vault,  ABIS.vault,  provider)
        const oracle   = new ethers.Contract(ADDRESSES.oracle, ABIS.oracle, provider)

        const reserve = await vault.usdcReserve()

        let ethPrice = null, usdcPrice = null
        try { ethPrice  = await oracle.getETHPrice()  } catch { /* stale */ }
        try { usdcPrice = await oracle.getUSDCPrice() } catch { /* stale */ }

        setData({
          reserve:   (Number(reserve) / 1e6).toFixed(2),
          ethPrice:  ethPrice  ? `$${(Number(ethPrice)  / 1e8).toFixed(2)}`  : 'Unavailable',
          usdcPrice: usdcPrice ? `$${(Number(usdcPrice) / 1e8).toFixed(4)}` : 'Unavailable',
        })
        setTs(new Date().toLocaleTimeString())
      } catch (err) {
        console.error('Markets load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
    const id = setInterval(load, 30000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-[calc(100vh-57px)] bg-[#080808] text-white flex flex-col">
      <div className="flex-1 max-w-4xl w-full mx-auto px-4 md:px-6 py-10 md:py-12">

        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            <p className="text-xs uppercase tracking-widest text-[#666] mb-2">Markets</p>
            <h1 className="text-2xl font-semibold">Protocol Terminal</h1>
            <p className="text-sm text-[#555] mt-1">
              Public parameters. All position amounts remain private.
            </p>
          </div>
          <div className="text-right">
            <StatusDot active={!loading && !!data} />
            {ts && (
              <p className="text-xs text-[#333] font-mono mt-1">Updated {ts}</p>
            )}
          </div>
        </div>

        <div className="space-y-6">

          {/* Live prices */}
          <div className="bg-[#0a0a0a] border border-[#1c1c1c] rounded-md overflow-hidden">
            <div className="px-5 py-3 border-b border-[#111] flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-[#555] font-mono">
                Chainlink Oracle — Live
              </span>
            </div>
            <div className="px-5">
              <TerminalRow label="ETH / USD"            value={data?.ethPrice}  loading={loading} glow />
              <TerminalRow label="USDC / USD"           value={data?.usdcPrice} loading={loading} glow />
              <TerminalRow label="USDC Reserve (Available)" value={loading ? null : `${data?.reserve} USDC`} loading={loading} />
            </div>
          </div>

          {/* Protocol params */}
          <div className="bg-[#0a0a0a] border border-[#1c1c1c] rounded-md overflow-hidden">
            <div className="px-5 py-3 border-b border-[#111]">
              <span className="text-xs uppercase tracking-widest text-[#555] font-mono">
                Protocol Parameters
              </span>
            </div>
            <div className="px-5">
              <TerminalRow label="ANNUAL_BORROW_RATE"     value="5.00%" />
              <TerminalRow label="INTEREST_ACCRUAL"       value="PER_SECOND / COMPOUND" />
              <TerminalRow label="MAX_LTV"                value="75%" />
              <TerminalRow label="LIQUIDATION_THRESHOLD"  value="HF < 100" />
              <TerminalRow label="AUCTION_DURATION"       value="3600s (1 hour)" />
              <TerminalRow label="COLLATERAL_ASSET"       value="ETH (native)" />
              <TerminalRow label="BORROW_ASSET"           value="USDC (Circle testnet)" />
              <TerminalRow label="CONFIDENTIALITY_LAYER"  value="iExec Nox / ERC-7984" />
              <TerminalRow label="NETWORK"                value="Arbitrum Sepolia / chainId 421614" />
            </div>
          </div>

          {/* Contracts */}
          <div className="bg-[#0a0a0a] border border-[#1c1c1c] rounded-md overflow-hidden">
            <div className="px-5 py-3 border-b border-[#111]">
              <span className="text-xs uppercase tracking-widest text-[#555] font-mono">
                Deployed Contracts
              </span>
            </div>
            <div className="px-5">
              {[
                { name: 'UMBRA_ORACLE',     addr: ADDRESSES.oracle     },
                { name: 'UMBRA_VAULT',      addr: ADDRESSES.vault      },
                { name: 'UMBRA_LIQUIDATOR', addr: ADDRESSES.liquidator },
                 { name: 'UMBRA_DEBTTOKEN', addr: ADDRESSES.debtToken },
      
              ].map(({ name, addr }) => (
                <TerminalRow
                  key={addr}
                  label={name}
                  value={`${addr.slice(0, 10)}...${addr.slice(-8)}`}
                  href={`https://sepolia.arbiscan.io/address/${addr}`}
                />
              ))}
            </div>
          </div>

        </div>
      </div>
      <Footer />
    </div>
  )
}
