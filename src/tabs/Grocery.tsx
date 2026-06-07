import { useMemo, useState } from 'react'
import { useStore } from '../store/store'
import { Sheet } from '../components/Sheet'
import { haptic } from '../lib/haptics'
import { useToast } from '../components/Toast'
import { IconCheck, IconTrash, IconPlus, IconMinus } from '../components/icons'
import { isoWeekKey, monthKeyOf } from '../lib/dates'
import { isLowByFraction, parseQty } from '../lib/units'
import { buildWeekOptions } from './Prep'

type PantryRow = {
  item: string
  current: string
  reorderBelow?: string
  monthlyNeed?: string
  staple: boolean
  low: boolean | null
}

export function GroceryTab() {
  const plan = useStore((s) => s.plan)
  const data = useStore((s) => s.data)
  const getWeekGroceries = useStore((s) => s.getWeekGroceries)
  const addGrocery = useStore((s) => s.addGrocery)
  const toggleGrocery = useStore((s) => s.toggleGrocery)
  const deleteGrocery = useStore((s) => s.deleteGrocery)
  const setStock = useStore((s) => s.setStock)
  const adjustStock = useStore((s) => s.adjustStock)
  const addLowItemsToWeek = useStore((s) => s.addLowItemsToWeek)
  const toast = useToast()

  const currentWeek = isoWeekKey()
  const month = monthKeyOf()
  const weekOptions = buildWeekOptions(plan.weeks.map((w) => ({ key: w.key, label: w.label })), currentWeek)
  const [week, setWeek] = useState(currentWeek)
  const editable = week === currentWeek

  const items = getWeekGroceries(week)
  const stock = data.monthlyGroceries[month] ?? {}

  // Unified pantry: plan staples first, then any other tracked items
  // (fresh items added when ticked off the shopping list, or ingredients
  // deducted by completed meals in Daily).
  const pantry = useMemo<PantryRow[]>(() => {
    const rows: PantryRow[] = []
    const seen = new Set<string>()
    for (const r of plan.monthlyStock) {
      const current = stock[r.item] ?? ''
      rows.push({
        item: r.item,
        current,
        reorderBelow: r.reorderBelow,
        monthlyNeed: r.monthlyNeed,
        staple: true,
        low: current ? isLowByFraction(current, r.monthlyNeed, 0.2) : null,
      })
      seen.add(r.item)
    }
    for (const item of Object.keys(stock)) {
      if (seen.has(item)) continue
      rows.push({ item, current: stock[item], staple: false, low: null })
      seen.add(item)
    }
    return rows
  }, [plan.monthlyStock, stock])

  const lowItems = useMemo(() => pantry.filter((r) => r.low === true).map((r) => r.item), [pantry])

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')

  // Adjust-stock sheet state
  const [adjust, setAdjust] = useState<{ item: string; current: string; mode: 'add' | 'use' } | null>(null)
  const [amount, setAmount] = useState('')

  function openAdjust(item: string, current: string, mode: 'add' | 'use') {
    // Prefill the unit from current value or the reorder threshold.
    const ref = parseQty(current) || parseQty(plan.monthlyStock.find((s) => s.item === item)?.reorderBelow)
    setAdjust({ item, current, mode })
    setAmount(ref?.unit ? `1 ${ref.unit}` : '')
  }

  function buyItem(it: { id: string; name: string; qty?: string; done: boolean }) {
    toggleGrocery(week, it.id)
    if (it.qty) adjustStock(month, it.name, it.qty, it.done ? -1 : 1)
    haptic(10)
  }

  return (
    <>
      <div className="card tight">
        <label className="field" style={{ marginBottom: 0 }}>
          <span className="lbl">Week</span>
          <select value={week} onChange={(e) => setWeek(e.target.value)}>
            {weekOptions.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
                {w.key === currentWeek ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Shopping list */}
      <div className="card">
        <div className="card-title">Shopping list</div>
        <div className="tiny faint" style={{ marginBottom: 10 }}>
          Tick an item when you buy it — its quantity is added to your pantry below.
        </div>
        {items.length === 0 && <div className="faint small">No items for this week.</div>}
        {items.map((it) => (
          <div className="list-row" key={it.id}>
            <button
              className={`toggle${it.done ? ' on' : ''}`}
              disabled={!editable}
              onClick={() => buyItem(it)}
              aria-label="Mark bought"
            >
              {it.done && <IconCheck width={16} height={16} />}
            </button>
            <div className="grow">
              <span style={{ textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--text-faint)' : 'var(--text)', fontWeight: 600, fontSize: 14 }}>
                {it.name}
              </span>
              {it.qty && <span className="tiny faint"> · {it.qty}</span>}
              {it.done && <span className="tiny" style={{ color: 'var(--accent)' }}> · in pantry</span>}
            </div>
            {editable && (
              <button className="icon-btn" onClick={() => deleteGrocery(week, it.id)} aria-label="Delete">
                <IconTrash width={17} height={17} />
              </button>
            )}
          </div>
        ))}
        {editable && (
          <button className="btn block" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
            <IconPlus width={18} height={18} /> Add item
          </button>
        )}
      </div>

      {/* Restock summary */}
      {lowItems.length > 0 && (
        <div className="card">
          <div className="card-title">
            Restock needed <span className="badge reorder">{lowItems.length}</span>
          </div>
          <div className="small muted" style={{ marginBottom: 10 }}>{lowItems.join(', ')}</div>
          <button
            className="btn primary block"
            onClick={() => {
              addLowItemsToWeek(currentWeek, lowItems)
              haptic(12)
              toast.show('Low items added to this week\u2019s shopping list')
            }}
          >
            Add low items to shopping list
          </button>
        </div>
      )}

      {/* Pantry inventory */}
      <div className="card">
        <div className="card-title">Pantry · {month}</div>
        <div className="tiny faint" style={{ marginBottom: 10 }}>
          Live inventory. Completing meals in Daily auto-deducts here; use −/+ to log what you used or bought.
        </div>
        {pantry.map((row) => (
          <div className="list-row pantry-row" key={row.item}>
            <div className="grow">
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{row.item}</span>
                {row.low === true && <span className="badge reorder">Reorder</span>}
                {row.low === false && <span className="badge ok">OK</span>}
              </div>
              <div className="tiny faint" style={{ marginTop: 2 }}>
                {row.current ? `Have ${row.current}` : 'Not tracked yet'}
                {row.monthlyNeed ? ` · need ${row.monthlyNeed}/mo · reorder < 20%` : ''}
              </div>
            </div>
            <div className="qty-controls">
              <button
                className="round-btn sm"
                onClick={() => openAdjust(row.item, row.current, 'use')}
                aria-label={`Use ${row.item}`}
                disabled={!row.current}
              >
                <IconMinus width={16} height={16} />
              </button>
              <button
                className="round-btn sm"
                onClick={() => openAdjust(row.item, row.current, 'add')}
                aria-label={`Add ${row.item}`}
              >
                <IconPlus width={16} height={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add shopping item */}
      <Sheet open={open} onClose={() => setOpen(false)} title="Add shopping item">
        <label className="field">
          <span className="lbl">Item</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spinach" autoFocus />
        </label>
        <label className="field">
          <span className="lbl">Quantity (optional)</span>
          <input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 500 g" />
        </label>
        <button
          className="btn primary block"
          disabled={!name.trim()}
          onClick={() => {
            addGrocery(week, name.trim(), qty.trim() || undefined)
            setName('')
            setQty('')
            setOpen(false)
          }}
        >
          Add
        </button>
      </Sheet>

      {/* Adjust pantry stock */}
      <Sheet open={!!adjust} onClose={() => setAdjust(null)} title={adjust ? adjust.item : 'Adjust stock'}>
        {adjust && (
          <>
            <div className="small faint" style={{ marginBottom: 12 }}>
              Currently have {adjust.current || 'nothing tracked'}.
            </div>
            <label className="field">
              <span className="lbl">Set exact amount</span>
              <input
                value={adjust.current}
                placeholder="e.g. 1.5 kg"
                onChange={(e) => {
                  setStock(month, adjust.item, e.target.value)
                  setAdjust({ ...adjust, current: e.target.value })
                }}
              />
            </label>
            <div className="divider" />
            <label className="field">
              <span className="lbl">{adjust.mode === 'add' ? 'Amount bought / restocked' : 'Amount used'}</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 250 g" autoFocus />
            </label>
            <div className="btn-row">
              <button
                className="btn grow"
                onClick={() => {
                  adjustStock(month, adjust.item, amount, -1)
                  haptic(8)
                  setAdjust(null)
                }}
                disabled={!amount.trim()}
              >
                <IconMinus width={16} height={16} /> Use
              </button>
              <button
                className="btn primary grow"
                onClick={() => {
                  adjustStock(month, adjust.item, amount, 1)
                  haptic(8)
                  setAdjust(null)
                }}
                disabled={!amount.trim()}
              >
                <IconPlus width={16} height={16} /> Add
              </button>
            </div>
          </>
        )}
      </Sheet>
    </>
  )
}
