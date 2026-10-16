import { useState, type ReactNode } from 'react'
import { DownloadIcon, TriangleAlertIcon, UploadIcon } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { POLLING_RATES, decodeInfo, decodeSettings, encodeSettings, type Settings } from '../hid/codec'
import { RK_SLEEP_BYTE, RK_SLEEP_DEFAULT } from '../hid/rk'
import { RY_POLLING, RyKeyboard, decodeRySettings, encodeRySettings, type RySettings } from '../hid/ry'
import { decodeMcSettings, encodeMcSettings, type McSettings } from '../hid/mc'
import { RAZER_POLLING, decodeRazerSettings, encodeRazerSettings, type RazerSettings } from '../hid/razer'
import { SS_SETTING } from '../hid/steelseries'
import { useStore } from '../store'
import { DEVICES } from '../devices/registry'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from './DeviceGate'
import { ReportButton } from './ReportDialog'
import { Field, Segmented, Slider, Stat, SwitchRow } from './ui'

export function SettingsPanel() {
  const protocol = useStore((s) => s.device?.protocol)
  if (protocol === 'rk') return <RkSettingsPanel />
  if (protocol === 'ry') return <RySettingsPanel />
  if (protocol === 'mc') return <McSettingsPanel />
  if (protocol === 'razer') return <RazerSettingsPanel />
  if (protocol === 'steelseries') return <SteelSeriesSettingsPanel />
  if (protocol === 'sinowealth') return <SinowealthSettingsPanel />
  return <SonixSettingsPanel />
}

const RK_SLEEP = [
  { value: 1, label: '5 min' },
  { value: 2, label: '10 min' },
  { value: 3, label: '20 min' },
  { value: 4, label: '30 min' },
  { value: 5, label: 'Never' },
]

/** Royal Kludge boards: no read-back, so the saved profile is the source of truth. */
function RkSettingsPanel() {
  const regions = useStore((s) => s.regions)!
  const update = useStore((s) => s.update)
  const pushProfile = useStore((s) => s.pushProfile)
  const device = useStore((s) => s.device)!
  const sleep = regions.led[RK_SLEEP_BYTE] || RK_SLEEP_DEFAULT
  const setSleep = (v: number) => {
    const led = Uint8Array.from(regions.led)
    led[RK_SLEEP_BYTE] = v
    update('led', led)
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Keyboard</CardTitle>
          <CardDescription>Sleep is sent together with the lighting, so it is saved per profile.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Field label="Lights sleep after">
            <Segmented value={sleep} options={RK_SLEEP} onChange={setSleep} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Device</CardTitle>
          <CardDescription>
            This keyboard can't report its settings back, so FCC shows the active profile. If it was changed elsewhere (Fn shortcuts, the official
            app), write the profile again to bring them back in line.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ModelPicker />
          <Separator />
          <Stat label="USB ID">
            {device.vendorId.toString(16).padStart(4, '0')}:{device.productId.toString(16).padStart(4, '0')}
          </Stat>
          <Separator />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={pushProfile}>
              <UploadIcon data-icon="inline-start" />
              Write profile to keyboard
            </Button>
            <ReportButton variant="ghost" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** Razer boards: settings are read from the keyboard, lighting comes from the profile. */
function RazerSettingsPanel() {
  const regions = useStore((s) => s.regions)!
  const update = useStore((s) => s.update)
  const pushProfile = useStore((s) => s.pushProfile)
  const device = useStore((s) => s.device)!
  const s = decodeRazerSettings(regions.settings)
  const set = (p: Partial<RazerSettings>) => update('settings', encodeRazerSettings(regions.settings, { ...s, ...p }))
  const rates = RAZER_POLLING.filter((r) => device.razer?.pollingRates.includes(r.hz))
  const rateItems = Object.fromEntries(rates.map((r) => [String(r.value), `${r.hz.toLocaleString()} Hz`]))

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Keyboard</CardTitle>
          <CardDescription>Read from the keyboard when it connects. These apply to every profile.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {rates.length > 0 && (
            <Field label="Polling rate">
              <Select items={rateItems} value={String(s.polling)} onValueChange={(v) => v && set({ polling: Number(v) })}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {rates.map((r) => (
                    <SelectItem key={r.value} value={String(r.value)}>
                      {r.hz.toLocaleString()} Hz
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
          {device.razer?.keyswitch && (
            <Field label="Keyswitch optimisation">
              <Segmented
                value={s.gaming ? 1 : 0}
                options={[
                  { value: 0, label: 'Typing' },
                  { value: 1, label: 'Gaming' },
                ]}
                onChange={(v) => set({ gaming: v === 1 })}
              />
            </Field>
          )}
          <div className="flex flex-col">
            <SwitchRow label="Game mode" hint="Turns off the Windows key so it can't throw you out of a game." checked={s.gameMode} onChange={(v) => set({ gameMode: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Device</CardTitle>
          <CardDescription>
            The keyboard can't report its lighting, so FCC shows the active profile. If lighting was changed elsewhere (Razer Synapse, Fn shortcuts),
            write the profile again. Close Synapse while using FCC: both send commands to the keyboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ModelPicker />
          <Separator />
          <Stat label="USB ID">
            {device.vendorId.toString(16).padStart(4, '0')}:{device.productId.toString(16).padStart(4, '0')}
          </Stat>
          <Separator />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={pushProfile}>
              <UploadIcon data-icon="inline-start" />
              Write profile to keyboard
            </Button>
            <ReportButton variant="ghost" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** SteelSeries boards: FCC streams the lighting; the one setting is which lighting packet the board takes. */
function SteelSeriesSettingsPanel() {
  const regions = useStore((s) => s.regions)!
  const update = useStore((s) => s.update)
  const device = useStore((s) => s.device)!
  const original = regions.settings[SS_SETTING.original] === 1
  const setOriginal = (v: boolean) => {
    const settings = Uint8Array.from(regions.settings)
    settings[SS_SETTING.original] = v ? 1 : 0
    update('settings', settings)
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Lighting</CardTitle>
          <CardDescription>
            This keyboard has no lighting effects of its own: FCC draws every frame, the way SteelSeries GG does, so effects run while FCC is running
            (also from the tray). Close SteelSeries GG while using FCC: both send lighting to the keyboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Field label="Lighting commands">
            <Segmented
              value={original ? 1 : 0}
              options={[
                { value: 0, label: 'Gen 3' },
                { value: 1, label: 'Original' },
              ]}
              onChange={(v) => setOriginal(v === 1)}
            />
          </Field>
          <p className="-mt-3 text-xs text-muted-foreground">
            Gen 3 boards normally take the newer commands. If the keys don't change colour, try Original and tell us which one worked.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Device</CardTitle>
          <CardDescription>Actuation, rapid trigger and the OLED screen aren't supported yet: they need a USB capture of SteelSeries GG first.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ModelPicker />
          <Separator />
          <Stat label="USB ID">
            {device.vendorId.toString(16).padStart(4, '0')}:{device.productId.toString(16).padStart(4, '0')}
          </Stat>
          <Separator />
          <div className="flex flex-wrap gap-2">
            <ReportButton variant="ghost" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/** Sinowealth 010c boards (AULA F99 …): FCC streams the lighting; nothing to set. */
function SinowealthSettingsPanel() {
  const device = useStore((s) => s.device)!
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Lighting</CardTitle>
          <CardDescription>
            FCC draws this keyboard's lighting and streams it, so effects run while FCC is running (also from the tray). About a second after FCC
            closes, the keyboard goes back to its own lighting. Close the keyboard's own software while using FCC.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Device</CardTitle>
          <CardDescription>Key remapping, macros and the keyboard's own effects aren't supported yet: they need a USB capture of its software first.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ModelPicker />
          <Separator />
          <Stat label="USB ID">
            {device.vendorId.toString(16).padStart(4, '0')}:{device.productId.toString(16).padStart(4, '0')}
          </Stat>
          <Separator />
          <div className="flex flex-wrap gap-2">
            <ReportButton variant="ghost" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SonixSettingsPanel() {
  const regions = useStore((s) => s.regions)!
  const update = useStore((s) => s.update)
  const s = decodeSettings(regions.settings)
  const info = decodeInfo(regions.info)
  const set = (p: Partial<Settings>) => update('settings', encodeSettings(regions.settings, { ...s, ...p }))
  const knownRate = POLLING_RATES.some((r) => r.value === s.polling)

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Keyboard</CardTitle>
          <CardDescription>Global settings, shared by every profile.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Field label="Polling rate" hint={knownRate ? undefined : 'Currently on the firmware default. Pick a rate to set it explicitly.'}>
            <Segmented value={s.polling} options={POLLING_RATES} onChange={(v) => set({ polling: v })} />
          </Field>
          <Field label="Sleep after" value={s.sleepMinutes ? `${s.sleepMinutes} min` : 'firmware default'}>
            <Slider min={0} max={30} value={s.sleepMinutes} onChange={(v) => set({ sleepMinutes: v })} />
          </Field>
          <div className="flex flex-col">
            <SwitchRow
              label="Stability mode"
              hint="Optimises the key algorithm for extreme settings."
              checked={s.stability}
              onChange={(v) => set({ stability: v })}
            />
            <SwitchRow
              label="Adaptive calibration (beta)"
              hint="Continuously adjusts calibration while you type."
              checked={s.adaptiveCalibration}
              onChange={(v) => set({ adaptiveCalibration: v })}
            />
            <SwitchRow
              label="Wake on any key"
              hint="Off = single-key wake, which uses less power while asleep."
              checked={s.allKeyWake}
              onChange={(v) => set({ allKeyWake: v })}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <DeviceCard>
          <Stat label="Firmware">v{info.firmware}</Stat>
          <Stat label="USB ID">
            {info.vid.toString(16).padStart(4, '0')}:{info.pid.toString(16).padStart(4, '0')}
          </Stat>
          <Stat label="Macro memory">{info.macroCapacity} bytes</Stat>
        </DeviceCard>
      </div>
    </div>
  )
}

/** Model, identity and the keyboard-wide actions. */
function DeviceCard({ children }: { children: ReactNode }) {
  const downloadBackup = useStore((s) => s.downloadBackup)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Device</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ModelPicker />
        <Separator />
        <div className="flex flex-col gap-1.5">{children}</div>
        <Separator />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadBackup}>
            <DownloadIcon data-icon="inline-start" />
            Download full backup
          </Button>
          <ReportButton variant="ghost" />
          <FactoryResetButton />
        </div>
      </CardContent>
    </Card>
  )
}

/** Wipes the keyboard's settings, after asking; kept quiet at the end of the Device card's actions. */
function FactoryResetButton() {
  const factoryReset = useStore((s) => s.factoryReset)
  const [confirmOpen, setConfirmOpen] = useState(false)
  return (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogTrigger render={<Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" />}>
        <TriangleAlertIcon data-icon="inline-start" />
        Factory reset…
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Factory reset the keyboard?</AlertDialogTitle>
          <AlertDialogDescription>
            This wipes the keymap, lighting, rapid trigger, advanced keys and macros on the keyboard. Your profiles in this app stay, so you can
            re-apply one afterwards.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setConfirmOpen(false)
              factoryReset()
            }}
          >
            Factory reset
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const RT_STABILITY = [0, 1, 2, 3, 4, 5].map((v) => ({ value: v, label: v ? `${v * 25} ms` : 'Off' }))

/** RongYuan RY5088 boards (MonsGeek FUN60 …). */
function RySettingsPanel() {
  const regions = useStore((s) => s.regions)!
  const update = useStore((s) => s.update)
  const kb = useStore((s) => s.kb)
  const s = decodeRySettings(regions.settings)
  const info = decodeInfo(regions.info)
  const set = (p: Partial<RySettings>) => update('settings', encodeRySettings(regions.settings, { ...s, ...p }))
  const probe = kb instanceof RyKeyboard ? kb.probe : null

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Keyboard</CardTitle>
          <CardDescription>Global settings, shared by every profile.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Field label="Polling rate">
            <Segmented value={s.polling} options={RY_POLLING} onChange={(v) => set({ polling: v })} />
          </Field>
          <Field label="Debounce" value={`${s.debounce} ms`}>
            <Slider min={0} max={20} value={s.debounce} onChange={(v) => set({ debounce: v })} />
          </Field>
          <Field label="Rapid trigger stability">
            <Segmented value={s.rtStability} options={RT_STABILITY} onChange={(v) => set({ rtStability: v })} />
          </Field>
          <div className="flex flex-col">
            <SwitchRow label="Anti-mistouch" checked={s.antiMistouch} onChange={(v) => set({ antiMistouch: v })} />
            <SwitchRow label="Swap WASD and arrows" hint="Same as Fn + W on the keyboard." checked={s.wasdSwap} onChange={(v) => set({ wasdSwap: v })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <DeviceCard>
          <Stat label="Firmware">v{info.firmware}</Stat>
          <Stat label="USB ID">
            {info.vid.toString(16).padStart(4, '0')}:{info.pid.toString(16).padStart(4, '0')}
          </Stat>
          {probe && <Stat label="Model ID">{probe.deviceId}</Stat>}
        </DeviceCard>
      </div>
    </div>
  )
}

/** MCHOSE boards (ACE 60 …). */
function McSettingsPanel() {
  const regions = useStore((s) => s.regions)!
  const update = useStore((s) => s.update)
  const s = decodeMcSettings(regions.settings)
  const info = decodeInfo(regions.info)
  const set = (p: Partial<McSettings>) => update('settings', encodeMcSettings(regions.settings, { ...s, ...p }))

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Keyboard</CardTitle>
          <CardDescription>Saved with the keyboard's active profile.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <Field label="Sleep after" value={`${s.sleepMinutes} min`}>
            <Slider min={1} max={60} value={Math.max(1, s.sleepMinutes)} onChange={(v) => set({ sleepMinutes: v })} />
          </Field>
          <div className="flex flex-col">
            <SwitchRow label="Lock the Windows key" checked={s.lockWin} onChange={(v) => set({ lockWin: v })} />
            <SwitchRow label="Bottom rapid trigger" checked={s.bottomRapidTrigger} onChange={(v) => set({ bottomRapidTrigger: v })} />
            <SwitchRow label="Berserk mode" checked={s.tachyon} onChange={(v) => set({ tachyon: v })} />
            <SwitchRow label="Debounce" checked={s.debounce} onChange={(v) => set({ debounce: v })} />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <DeviceCard>
          <Stat label="Firmware">v{info.firmware}</Stat>
          <Stat label="USB ID">
            {info.vid.toString(16).padStart(4, '0')}:{info.pid.toString(16).padStart(4, '0')}
          </Stat>
        </DeviceCard>
      </div>
    </div>
  )
}

/** Lets the user correct which model the connected board is. */
function ModelPicker() {
  const device = useStore((s) => s.device)
  const chooseDevice = useStore((s) => s.chooseDevice)
  const pid = useStore((s) => s.kb?.identity.productId)
  // only models that speak the same protocol as the connected board
  const wired = DEVICES.filter((d) => d.transport === 'wired' && d.protocol === (device?.protocol ?? 'sonix'))
  const same = wired.filter((d) => d.productId === pid)
  const others = wired.filter((d) => d.productId !== pid)
  const items = Object.fromEntries(wired.map((d) => [d.id, d.name]))
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Model</span>
        {device && <StatusBadge status={device.status} />}
      </div>
      <Select items={items} value={device?.id ?? null} onValueChange={(v) => v && chooseDevice(v as string)}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Unknown keyboard" />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {same.length > 0 && (
            <SelectGroup>
              <SelectLabel>Same USB id</SelectLabel>
              {same.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {same.length > 0 && <SelectSeparator />}
          <SelectGroup>
            <SelectLabel>All supported models</SelectLabel>
            {others.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name} <span className="text-muted-foreground">· {d.productId.toString(16).padStart(4, '0')}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {device?.protocol === 'ry' ? 'Reported by the keyboard itself.' : 'Detected from the USB id.'} Change it if the layout looks
        wrong; each model keeps its own profiles.
      </p>
    </div>
  )
}
