window.masterEnemies = [
  {
    id: "enemy_barn_biter",
    name: "納屋に巣食う噛みつく「なにか」",
    hp: 240,
    threat: 38
  },
  {
    id: "enemy_road_raiders",
    name: "街道の外れに現れた徒党",
    shortName: "野盗",
    hp: 320,
    threat: 38
  },
  // ★ 一撃が重い敵（2026-07-30・測定用に追加）。攻撃偏重で、その分HPを削ってある。
  //   野盗（HP320/threat38）と総ダメージ量が同程度になるようHPを下げた（threat×想定ラウンド数で揃える）。
  //   ★ threat は 46。50以上にしないのは、中盤帯の敵を入れる前に「エルネの maxHp 79 が
  //     前衛シェアに対して小さい」問題を解決する、と発動条件を固定しているため（CURRENT_SPEC）。
  //   ★ どの依頼にも割り当てていない。既存の依頼の敵を差し替えると基準値が全部動くため、
  //     測定スクリプトの中だけで別条件として使う（scripts/measure-enemy.js）。
  {
    id: "enemy_ridge_bear",
    name: "峠道に降りてきた大熊",
    shortName: "大熊",
    hp: 260,
    threat: 46
  }
];
