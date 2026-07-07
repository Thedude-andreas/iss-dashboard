import {
  ConsoleLogLevel,
  ConsoleLoggerProvider,
  LightstreamerClient,
} from 'lightstreamer-client-web/lightstreamer.esm'

LightstreamerClient.setLoggerProvider(new ConsoleLoggerProvider(ConsoleLogLevel.WARN))

const DATA_ADAPTER = 'ISSLIVE'
const SERVER = 'https://push.lightstreamer.com'

const client = new LightstreamerClient(SERVER, DATA_ADAPTER)
client.connectionOptions.setRequestedMaxBandwidth(50)

let attachmentCount = 0
let isConnected = false

export const SUBSCRIPTION_FIELDS = [
  'TimeStamp',
  'Value',
  'Status.Class',
  'Status.Indicator',
  'Status.Color',
  'CalibratedData',
]

export type ClientStatusListener = (status: string) => void

export function attachLightstreamerClient(listener?: ClientStatusListener) {
  const handler = listener
    ? {
        onStatusChange: (status: string) => listener(status),
      }
    : null

  if (handler) {
    client.addListener(handler)
  }

  attachmentCount += 1
  if (!isConnected) {
    client.connect()
    isConnected = true
  }

  return () => {
    attachmentCount = Math.max(0, attachmentCount - 1)
    if (handler) {
      client.removeListener(handler)
    }
    if (attachmentCount === 0) {
      client.disconnect()
      isConnected = false
    }
  }
}

export function getLightstreamerClient() {
  return client
}
