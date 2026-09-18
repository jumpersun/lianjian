// A bounded recommendation pool, not a professional or medical certification.
// Keep unknown or contradictory dataset entries browseable, but out of automatic selection.
const entries = [
  ["0659", "靠墙俯卧撑", 0, "horizontal-push", "上肢推力", ["肩", "腕"], "靠近墙面开始，身体保持一条直线。"],
  ["0658", "靠墙俯卧撑（变式）", 0, "horizontal-push", "上肢推力", ["肩", "腕"], "用稳定墙面支撑，不要使用可移动家具。"],
  ["2398", "跪姿窄距俯卧撑", 1, "horizontal-push", "上肢推力", ["肩", "腕", "膝"], "双膝有软垫支撑，肘部靠近身体。"],
  ["0662", "标准俯卧撑", 2, "horizontal-push", "上肢推力", ["肩", "腕"], "先能控制下降与回推，再增加次数。"],
  ["3294", "射手俯卧撑", 3, "horizontal-push", "上肢推力", ["肩", "腕"], "进阶动作，需要已有稳定的标准俯卧撑能力。"],
  ["3119", "徒手深蹲", 0, "squat", "下肢蹲起", ["膝", "腰", "背"], "在能够稳定控制的幅度内蹲起。"],
  ["1685", "深蹲上举伸展", 1, "squat", "下肢蹲起", ["膝", "腰", "背", "肩"], "先掌握徒手深蹲，再配合手臂上举。"],
  ["3013", "地面臀桥", 0, "bridge", "髋部伸展", ["膝", "腰", "背"], "抬髋时不要通过过度挺腰增加幅度。"],
  ["1422", "骨盆倾斜臀桥", 0, "bridge", "髋部伸展", ["膝", "腰", "背"], "缓慢抬起与放下，保持呼吸。"],
  ["3561", "臀桥交替抬腿", 2, "bridge", "髋部伸展", ["膝", "腰", "背"], "保持骨盆稳定，先掌握双腿臀桥。"],
  ["1373", "站姿提踵", 0, "calf-raise", "小腿力量", ["膝"], "扶稳墙面保持平衡，脚跟缓慢放下。"],
  ["1387", "单腿提踵", 1, "calf-raise", "小腿力量", ["膝"], "扶墙完成，两侧分别记录次数。"],
  ["0276", "死虫式", 0, "core-stability", "躯干稳定", ["腰", "背", "肩"], "只在腰背能够稳定贴地的幅度内伸展。"],
  ["0274", "地面卷腹", 0, "core-flexion", "躯干屈曲", ["腰", "背"], "肩部离地即可，不用手拉扯颈部。"],
  ["0293", "哑铃俯身划船", 1, "horizontal-pull", "上肢拉力", ["腰", "背", "肩", "腕"], "先熟悉髋部折叠，避免借助身体晃动。"],
  ["1022", "弹力带站姿后束划船", 1, "horizontal-pull", "上肢拉力", ["腰", "背", "肩", "腕"], "确认弹力带完整并踩稳，再开始拉动。"],
  ["0294", "哑铃弯举", 0, "elbow-flexion", "手臂屈曲", ["腕"], "上臂保持稳定，从能够控制的轻负荷开始。"],
  ["0968", "弹力带交替弯举", 0, "elbow-flexion", "手臂屈曲", ["腕"], "检查弹力带有无破损，避免突然回弹。"],
  ["0334", "哑铃侧平举", 1, "shoulder-abduction", "肩部抬举", ["肩", "腕"], "以能控制的轻负荷开始，不要耸肩借力。"],
  ["0426", "哑铃站姿推举", 1, "vertical-push", "过顶推力", ["肩", "腕", "腰", "背"], "先确认无不适且能稳定控制过顶姿势。"],
  ["0997", "弹力带推举", 1, "vertical-push", "过顶推力", ["肩", "腕", "腰", "背"], "踩稳弹力带，缓慢控制回程。"],
  ["1760", "哑铃高脚杯深蹲", 1, "squat", "下肢蹲起", ["膝", "腰", "背"], "先掌握徒手蹲起，再增加外部负荷。"],
  ["1004", "弹力带深蹲", 1, "squat", "下肢蹲起", ["膝", "腰", "背"], "检查弹力带，先在可控幅度内训练。"],
  ["0300", "哑铃硬拉", 2, "hinge", "髋部铰链", ["膝", "腰", "背"], "需要掌握髋部折叠；不熟悉时先学习教学。"],
  ["1369", "弹力带提踵", 0, "calf-raise", "小腿力量", ["膝"], "先确认站姿平衡和弹力带位置稳定。"],
];

export const CORE_EXERCISES = Object.fromEntries(entries.map(([id, title, level, pattern, purpose, cautions, cue]) => [
  id, { title, level, pattern, purpose, cautions, cue, doseType: "reps", impact: "low", reviewStatus: "产品标签，未经专业审核" },
]));

export const LEVEL_LABELS = ["入门", "基础", "中级", "进阶"];
export const coreMetadata = (exercise) => CORE_EXERCISES[exercise?.id] || null;
export function normalizeCatalogExercise(exercise) {
  // 3119's source labels say waist/abs, while its instructions and illustration describe a squat.
  return exercise.id === "3119" ? { ...exercise, body_part: "upper legs", target: "quads" } : exercise;
}
export const sameMovement = (left, right) => Boolean(
  coreMetadata(left) && coreMetadata(left).pattern === coreMetadata(right)?.pattern,
);
