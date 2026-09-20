import * as os from 'os';

export interface LanInterface {
  name: string;
  ip: string;
  isDefault: boolean;
}

// Padrões de interfaces virtuais ou túneis que devem ser ignorados na descoberta de LAN
const VIRTUAL_INTERFACE_REGEX =
  /vEthernet|VirtualBox|VMware|WSL|docker|vbox|tap|tun|tailscale|hyper-v|dummy|teredo|pseudo/i;

/**
 * Enumera e filtra as interfaces de rede da máquina, identificando adaptadores físicos de LAN
 * e descartando interfaces virtuais, túneis e loopback.
 */
export function getLanInterfaces(): LanInterface[] {
  const interfaces = os.networkInterfaces();
  const results: LanInterface[] = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs || VIRTUAL_INTERFACE_REGEX.test(name)) {
      continue;
    }

    for (const addr of addrs) {
      // Aceita apenas IPv4 não-interno (descarta 127.x.x.x e IPv6)
      const isIpv4 = addr.family === 'IPv4' || (addr.family as unknown as number) === 4;
      if (!isIpv4 || addr.internal) {
        continue;
      }

      // Descarta endereços de autoconfiguração link-local (169.254.x.x)
      if (addr.address.startsWith('169.254.')) {
        continue;
      }

      results.push({
        name,
        ip: addr.address,
        isDefault: false,
      });
    }
  }

  // Ordena priorizando redes locais típicas (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
  results.sort((a, b) => {
    const score = (ip: string): number => {
      if (ip.startsWith('192.168.')) return 3;
      if (ip.startsWith('10.')) return 2;
      if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return 2;
      return 1;
    };
    return score(b.ip) - score(a.ip);
  });

  if (results.length > 0) {
    results[0].isDefault = true;
  }

  return results;
}

/**
 * Retorna o melhor IP de LAN para o convite, com fallback seguro para loopback 127.0.0.1
 */
export function getDefaultLanIp(): string {
  const lanList = getLanInterfaces();
  const defaultIface = lanList.find((i) => i.isDefault);
  return defaultIface ? defaultIface.ip : '127.0.0.1';
}
