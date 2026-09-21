import MapView from './map/MapView'

export default function App() {
  return (
    <div className="relative h-full w-full text-slate-100">
      <MapView />
      <header className="pointer-events-none absolute inset-x-0 top-0 p-3 text-lg font-semibold drop-shadow">
        Weather Taiwan
      </header>
    </div>
  )
}
