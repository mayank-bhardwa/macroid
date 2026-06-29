import { useState } from 'react'
import { useStore } from '../store/store'
import { Sheet } from '../components/Sheet'
import { haptic } from '../lib/haptics'
import { useToast } from '../components/Toast'
import { IconTrash, IconPlus } from '../components/icons'
import { monthKeyOf } from '../lib/dates'
import { GROCERY_UNITS, type GroceryUnit } from '../types'

export function GroceryTab() {
  const month = monthKeyOf()
  const getGroceries = useStore((s) => s.getGroceries)
  const addGroceryItem = useStore((s) => s.addGroceryItem)
  const deleteGroceryItem = useStore((s) => s.deleteGroceryItem)
  const reseedGrocery = useStore((s) => s.reseedGrocery)
  // Re-render when the stored list (or the plan template it seeds from) changes.
  useStore((s) => s.data.grocery)
  useStore((s) => s.plan.grocery)
  const toast = useToast()

  const items = getGroceries(month)

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [unit, setUnit] = useState<GroceryUnit>('kg')

  const canAdd = name.trim() !== '' && qty.trim() !== '' && Number(qty) > 0

  const add = () => {
    if (!canAdd) return
    addGroceryItem(month, name.trim(), Number(qty), unit)
    haptic(10)
    setName('')
    setQty('')
    setUnit('kg')
    setOpen(false)
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Shopping list</div>
        <div className="tiny faint" style={{ marginBottom: 12 }}>
          Everything to buy this month, with the quantity needed. Edit the default list — or import
          one — from Settings → Monthly grocery list.
        </div>

        {items.length === 0 ? (
          <div className="empty">
            <div className="big">🛒</div>
            <div className="faint small">Your shopping list is empty.</div>
          </div>
        ) : (
          items.map((it) => (
            <div className="list-row" key={it.id}>
              <span className="grow" style={{ fontWeight: 600, fontSize: 14 }}>{it.name}</span>
              <span className="small muted" style={{ whiteSpace: 'nowrap', marginRight: 4 }}>
                {it.qty} {it.unit}
              </span>
              <button className="icon-btn" onClick={() => deleteGroceryItem(month, it.id)} aria-label="Delete">
                <IconTrash width={17} height={17} />
              </button>
            </div>
          ))
        )}

        <button className="btn block" style={{ marginTop: 12 }} onClick={() => setOpen(true)}>
          <IconPlus width={18} height={18} /> Add item
        </button>

        {items.length > 0 && (
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button
              className="btn sm ghost"
              onClick={() => {
                reseedGrocery(month)
                haptic(8)
                toast.show('Reset to plan list')
              }}
            >
              Reset to plan list
            </button>
          </div>
        )}
      </div>

      {/* Add grocery item */}
      <Sheet open={open} onClose={() => setOpen(false)} title="Add to shopping list">
        <label className="field">
          <span className="lbl">Item</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spinach" autoFocus />
        </label>
        <div className="row" style={{ gap: 8 }}>
          <label className="field grow" style={{ marginBottom: 0 }}>
            <span className="lbl">Quantity for the month</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="e.g. 2"
            />
          </label>
          <label className="field" style={{ marginBottom: 0, width: 120 }}>
            <span className="lbl">Unit</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value as GroceryUnit)}>
              {GROCERY_UNITS.map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </label>
        </div>
        <button className="btn primary block" style={{ marginTop: 14 }} disabled={!canAdd} onClick={add}>
          Add to list
        </button>
      </Sheet>
    </>
  )
}

