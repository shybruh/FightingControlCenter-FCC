import { useState } from 'react'
import { clearAdvanced } from '../hid/advanced'
import { bindingLabel, decodeBinding, withBinding, type Binding } from '../hid/codec'
import { KEY_GROUPS, modifierNames } from '../data/keycodes'
import { HAS_FN_LAYER, KEY_BY_ID, isFnKey } from '../data/layout'
import { useStore } from '../store'
import { Keyboard } from './Keyboard'
import { RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Toggle } from '@/components/ui/toggle'
import { Segmented } from './ui'

/** The Fn key is the only way into the Fn layer (RESET, lighting controls), so we never let it be remapped. */

const MODS = KEY_GROUPS.find((g) => g.kind === 'modifier')!.keys

export function KeymapPanel() {
  const regions = useStore((s) => s.regions)!
  const updateMany = useStore((s) => s.updateMany)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [layer, setLayer] = useState<'base' | 'fn'>('base')
  const [group, setGroup] = useState(KEY_GROUPS[0].name)
  const [mods, setMods] = useState(0)
  const mouseOk = useStore((s) => s.device?.caps.mouseBindings !== false)

  const id = selected.size === 1 ? [...selected][0] : null
  const key = id != null ? KEY_BY_ID.get(id) : null
  const binding = id != null ? decodeBinding(regions.keys, id) : null
  const locked = id != null && isFnKey(KEY_BY_ID.get(id))

  const assign = (b: Binding) => {
    if (id == null || locked) return
    // replacing an advanced key also frees its pair partner / DKS slot
    const cleared = clearAdvanced(regions.keys, regions.dks, [id])
    updateMany({ dks: cleared.dks, keys: withBinding(cleared.keys, [id], b) })
  }

  const pick = (kind: string, value: number) => {
    switch (kind) {
      case 'key':
        return assign({ type: 'key', mods, code: value })
      case 'modifier':
        return assign({ type: 'key', mods: value, code: 0 })
      case 'media':
        return assign({ type: 'media', usage: value })
      case 'mouse':
        return assign({ type: 'mouse', button: value })
      case 'wheel':
        return assign({ type: 'wheel', dir: value === 255 ? 255 : 1 })
    }
  }

  const groups = KEY_GROUPS.filter((x) => mouseOk || (x.kind !== 'mouse' && x.kind !== 'wheel'))
  const g = groups.find((x) => x.name === group) ?? groups[0]

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Keymap</CardTitle>
          <CardDescription>{layer === 'base' ? 'Select a key to remap it.' : 'What each key does while holding Fn. These are built into the keyboard firmware and can’t be changed.'}</CardDescription>
          <CardAction className={HAS_FN_LAYER ? undefined : 'hidden'}>
            <Segmented
              value={layer}
              options={[
                { value: 'base', label: 'Base layer' },
                { value: 'fn', label: 'Fn layer' },
              ]}
              onChange={(v) => {
                setLayer(v)
                setSelected(new Set())
              }}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <Keyboard
            single
            selected={layer === 'base' ? selected : new Set()}
            onSelectionChange={(s) => layer === 'base' && setSelected(s)}
            face={(k) => {
              if (layer === 'fn') return { main: k.fn ?? '', sub: k.fn ? k.label : undefined }
              const label = bindingLabel(decodeBinding(regions.keys, k.id))
              return label ? { main: label, sub: k.label, marked: true } : {}
            }}
          />
        </CardContent>
      </Card>

      {layer === 'base' && (
        <Card key={id ?? 'none'} className="swap-in">
          {!key ? (
            <CardContent className="py-6 text-center text-sm text-muted-foreground">Select a key to remap it.</CardContent>
          ) : locked ? (
            <CardContent className="py-6 text-center text-sm text-muted-foreground">The Fn key can't be remapped — it's your way into the Fn layer.</CardContent>
          ) : (
            <>
              <CardHeader>
                <CardTitle>
                  {key.label || 'Space'} <span className="font-normal text-muted-foreground">→ {bindingLabel(binding!) ?? 'default'}</span>
                </CardTitle>
                {binding && !['default', 'key', 'media', 'mouse', 'wheel'].includes(binding.type) && (
                  <CardDescription className="text-amber-400">
                    This key holds an advanced function ({bindingLabel(binding)}). Assigning a new key replaces it.
                  </CardDescription>
                )}
                <CardAction>
                  <Button variant="outline" size="sm" disabled={binding?.type === 'default'} onClick={() => assign({ type: 'default' })}>
                    <RotateCcwIcon data-icon="inline-start" />
                    Reset to default
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Tabs value={group} onValueChange={(v) => setGroup(v as string)}>
                  <TabsList className="h-auto flex-wrap">
                    {groups.map((x) => (
                      <TabsTrigger key={x.name} value={x.name}>
                        {x.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                {g.kind === 'key' && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-muted-foreground">Combine with</span>
                    {MODS.map((m) => (
                      <Toggle
                        key={m.value}
                        size="sm"
                        variant="outline"
                        pressed={!!(mods & m.value)}
                        onPressedChange={() => setMods(mods ^ m.value)}
                      >
                        {m.label}
                      </Toggle>
                    ))}
                    {mods > 0 && <span className="ml-1 text-xs text-muted-foreground">{modifierNames(mods).join(' + ')} + …</span>}
                  </div>
                )}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5">
                  {g.keys.map((k) => (
                    <Button key={k.value} variant="outline" className="h-10" onClick={() => pick(g.kind, k.value)}>
                      {k.label}
                    </Button>
                  ))}
                </div>
              </CardContent>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
