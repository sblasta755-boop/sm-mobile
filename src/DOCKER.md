# SmartClean Mobile Docker

## LAN development

```bash
cd mobile
docker compose up --build expo
```

Open Expo Go and scan the QR code printed in the container logs. Set `REACT_NATIVE_PACKAGER_HOSTNAME` to your machine LAN IP if Expo shows an unreachable host.

## Shareable Expo tunnel

```bash
cd mobile
docker compose --profile tunnel up --build expo-tunnel
```

The logs will print a shareable Expo tunnel URL/QR. If your Expo account requires authentication in CI-like environments, set `EXPO_TOKEN` first:

```bash
export EXPO_TOKEN=your_expo_token
docker compose --profile tunnel up --build expo-tunnel
```

## Deployable web export

```bash
cd mobile
docker compose --profile web up --build web
```

The exported Expo web build is served by Nginx on `http://localhost:8088`.

## API configuration

Use `EXPO_PUBLIC_API_BASE_URL` for backend access:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.50:8000/api/v1 docker compose up --build expo
```

Android emulator default remains `http://10.0.2.2:8000/api/v1`.
