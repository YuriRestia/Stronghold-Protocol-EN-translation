// test/doctor.test.js — tools/doctor.mjs 的地址分类（纯函数，不起服务器）。
// 启动器「发给朋友」那一行就是按这里的 kind 打的：
//   * 代理软件的 TUN 适配器（Clash / Mihomo 把 198.18.0.0/15 当 fake-ip 池）和 Hyper-V / WSL / Docker
//     这类网卡，从别的电脑访问不到，冒充「公网 IP」发给朋友只会让人连不上 —— 归 virtual；
//   * 点对点 VPN（Tailscale / ZeroTier / WireGuard / Radmin VPN / Hamachi）正相反，那正是同组好友
//     互连用的地址 —— 归 vpn，要留着。
// 分类顺序是 linklocal → 198.18/15 → VPN_IF → VIRTUAL_IF → 私网 → public，所以同一个名字只由
// 最先命中的规则决定；下面的测试把这套顺序钉住，避免有人把规则随手复制到两处而其中一处永远不生效。

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { classifyAddresses, KIND_LABEL, checkClipBounds } from '../tools/doctor.mjs';

/** @param {string} name @param {string} address */
const iface = (name, address) => [name, [{ family: 'IPv4', address, internal: false }]];

describe('启动器「发给朋友」的地址清单（tools/doctor.mjs）', () => {
  test('只列真正能连的地址：真正局域网在前，虚拟网卡/代理 TUN 不要冒充公网 IP', () => {
    const list = classifyAddresses(Object.fromEntries([
      iface('Mihomo', '198.18.0.1'),                    // Clash/Mihomo TUN 的 fake-ip 池（RFC 2544）
      iface('vEthernet (Default Switch)', '172.25.112.1'),
      iface('以太网 5', '192.168.1.7'),
      iface('Radmin VPN', '26.200.79.213'),
      iface('Tailscale', '100.64.0.9'),
    ]));
    const kind = (ip) => list.find((a) => a.address === ip)?.kind;
    assert.equal(kind('198.18.0.1'), 'virtual', '代理 TUN 不能当成公网 IP 发给朋友');
    assert.equal(kind('172.25.112.1'), 'virtual', 'Hyper-V 网卡');
    assert.equal(kind('26.200.79.213'), 'vpn', 'Radmin VPN 是点对点地址');
    assert.equal(kind('100.64.0.9'), 'vpn', 'CGNAT（Tailscale）');
    assert.equal(kind('192.168.1.7'), 'lan');
    assert.equal(list[0].address, '192.168.1.7', '局域网地址排最前');

    // launch.mjs 就是按这三种 kind 打印「发给朋友」的
    const shareable = list.filter((a) => ['lan', 'vpn', 'public'].includes(a.kind)).map((a) => a.address);
    assert.deepEqual(shareable, ['192.168.1.7', '26.200.79.213', '100.64.0.9']);
    assert.ok(!shareable.includes('198.18.0.1'));
    assert.ok(KIND_LABEL.virtual, '虚拟网卡也有标签可读');
  });

  test('198.18.0.0/15 整体都算虚拟（不只是 .0.1）', () => {
    const list = classifyAddresses(Object.fromEntries([iface('Clash', '198.19.255.254'), iface('x', '198.20.0.1')]));
    assert.equal(list.find((a) => a.address === '198.19.255.254').kind, 'virtual');
    assert.equal(list.find((a) => a.address === '198.20.0.1').kind, 'public', '198.20 不在 /15 里');
  });

  test('tun/tap/wg 这类点对点网卡一律归 vpn —— 虚拟网卡规则不许抢在 VPN 规则前面', () => {
    const list = classifyAddresses(Object.fromEntries([
      iface('tun0', '10.7.0.3'),
      iface('tap0', '10.7.0.5'),
      iface('wg0', '10.7.0.6'),
      iface('vEthernet (Default Switch)', '10.7.0.8'),
    ]));
    const kind = (ip) => list.find((a) => a.address === ip)?.kind;
    assert.equal(kind('10.7.0.3'), 'vpn', 'tun0 是点对点 VPN；若这里变成 virtual，说明有人又把 ^tun 抄回了 VIRTUAL_IF');
    assert.equal(kind('10.7.0.5'), 'vpn');
    assert.equal(kind('10.7.0.6'), 'vpn');
    assert.equal(kind('10.7.0.8'), 'virtual', '只有虚拟网卡规则命中的名字才算 virtual');
  });

  test('VPN 规则是子串匹配：macOS 的 utunN 也归 vpn（记录现状，不是理想解）', () => {
    // VPN_IF 的 `tun\d` 没有边界，macOS 的 utunN 里含 "tunN"，于是 utunN 一律先被 VPN 规则命中；
    // VIRTUAL_IF 里那条 `utun` 只在名字不含「tun＋数字」时才轮得到。这两条钉住现状：
    // 改分类顺序或给正则加边界都会让这里先红，提醒改动者想清楚 macOS 的 utun 该怎么算。
    const list = classifyAddresses(Object.fromEntries([iface('utun4', '10.7.0.4'), iface('utun', '10.7.0.9')]));
    const kind = (ip) => list.find((a) => a.address === ip)?.kind;
    assert.equal(kind('10.7.0.4'), 'vpn', 'utun4 含 "tun4" → VPN_IF 先命中');
    assert.equal(kind('10.7.0.9'), 'virtual', '名字里没有「tun＋数字」，才轮到 VIRTUAL_IF 的 utun');
  });
});

// (fork) data/clip-bounds.json (tools/assets/clip-bounds.mjs): none without models, a warning when missing or older
// than a skeleton on disk, ok otherwise
test('doctor: the impostor clip-bounds table — skip, missing, ok, stale', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-doctor-cb-'));
  try {
    assert.equal(checkClipBounds(root).state, 'skip', 'no models');
    const dir = path.join(root, 'public', 'assets', 'spine', 'op', 'm');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'm.skel'), 'x');
    fs.writeFileSync(path.join(dir, 'm.atlas'), 'x');
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(dir, 'm.skel'), old, old);
    assert.equal(checkClipBounds(root).state, 'warn', 'models, no table');
    assert.match(checkClipBounds(root).detail, /npm run clip-bounds/);
    fs.mkdirSync(path.join(root, 'data'));
    fs.writeFileSync(path.join(root, 'data', 'clip-bounds.json'), JSON.stringify({ format: 1, count: 1, clips: 3, generated: '2026-11-09T00:00:00Z' }));
    assert.equal(checkClipBounds(root).state, 'ok');
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(path.join(dir, 'm.skel'), later, later);
    assert.equal(checkClipBounds(root).state, 'warn', 'a model changed after the table');
    fs.writeFileSync(path.join(root, 'data', 'clip-bounds.json'), '{"format":0}');
    assert.equal(checkClipBounds(root).state, 'warn', 'unreadable / another format');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
