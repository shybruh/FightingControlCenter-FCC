import { useState } from 'react'
import { DownloadIcon, RefreshCwIcon, SparklesIcon, TriangleAlertIcon, UploadIcon } from 'lucide-react'
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
import { useStore } from '../store'
import { DEVICES } from '../devices/registry'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { StatusBadge } from './DeviceGate'
import { ReportButton } from './ReportDialog'
import { Field, Segmented, Slider, Stat, SwitchRow } from './ui'

export function SettingsPanel() {
  const rk = useStore((s) => s.device?.protocol === 'rk')
  return rk ? <RkSettingsPanel /> : <SonixSettingsPanel />
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
            <IntroButton />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function SonixSettingsPanel() {
  const regions = useStore((s) => s.regions)!
  const update = useStore((s) => s.update)
  const downloadBackup = useStore((s) => s.downloadBackup)
  const factoryReset = useStore((s) => s.factoryReset)
  const refresh = useStore((s) => s.refresh)
  const [confirmOpen, setConfirmOpen] = useState(false)

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
        <Card>
          <CardHeader>
            <CardTitle>Device</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ModelPicker />
            <Separator />
            <div className="flex flex-col gap-1.5">
              <Stat label="Firmware">v{info.firmware}</Stat>
              <Stat label="USB ID">
                {info.vid.toString(16).padStart(4, '0')}:{info.pid.toString(16).padStart(4, '0')}
              </Stat>
              <Stat label="Macro memory">{info.macroCapacity} bytes</Stat>
            </div>
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={downloadBackup}>
                <DownloadIcon data-icon="inline-start" />
                Download full backup
              </Button>
              <Button variant="ghost" onClick={refresh}>
                <RefreshCwIcon data-icon="inline-start" />
                Re-read from keyboard
              </Button>
              <ReportButton variant="ghost" />
              <IntroButton />
            </div>
          </CardContent>
        </Card>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">Danger zone</CardTitle>
            <CardDescription>Wipes every setting on the keyboard: keymap, lighting, RT, macros. Saved profiles in this app are kept.</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger render={<Button variant="destructive" />}>
                <TriangleAlertIcon data-icon="inline-start" />
                Factory reset keyboard
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
                  <AlertDialogAction variant="destructive" onClick={() => {
                      setConfirmOpen(false)
                      factoryReset()
                    }}>
                    Factory reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function IntroButton() {
  const openIntro = useStore((s) => s.openIntro)
  return (
    <Button variant="ghost" onClick={openIntro}>
      <SparklesIcon data-icon="inline-start" />
      Show intro
    </Button>
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
      <p className="text-xs text-muted-foreground">Detected from the USB id and name. Change it if the layout looks wrong; each model keeps its own profiles.</p>
    </div>
  )
}
