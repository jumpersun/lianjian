import { coreMetadata } from "./coreExercises.js";

export const BODY_PART_LABELS = {
  all: "全部",
  back: "背部",
  cardio: "心肺",
  chest: "胸部",
  "lower arms": "前臂",
  "lower legs": "小腿",
  neck: "颈部",
  shoulders: "肩部",
  "upper arms": "手臂",
  "upper legs": "腿臀",
  waist: "核心",
};

export const EQUIPMENT_LABELS = {
  all: "全部器材",
  assisted: "辅助器械",
  band: "弹力带",
  barbell: "杠铃",
  "body weight": "徒手",
  "bosu ball": "波速球",
  cable: "绳索器械",
  dumbbell: "哑铃",
  "elliptical machine": "椭圆机",
  "ez barbell": "曲杆杠铃",
  hammer: "训练锤",
  kettlebell: "壶铃",
  "leverage machine": "固定器械",
  "medicine ball": "药球",
  "olympic barbell": "奥林匹克杠铃",
  "resistance band": "阻力带",
  roller: "泡沫轴",
  rope: "训练绳",
  "skierg machine": "滑雪机",
  "sled machine": "雪橇机",
  "smith machine": "史密斯机",
  "stability ball": "健身球",
  "stationary bike": "动感单车",
  "stepmill machine": "登阶机",
  tire: "轮胎",
  "trap bar": "六角杠铃",
  "upper body ergometer": "上肢功率车",
  weighted: "负重",
  "wheel roller": "健腹轮",
};

export const TARGET_LABELS = {
  abductors: "髋外展肌",
  abs: "腹肌",
  adductors: "髋内收肌",
  biceps: "肱二头肌",
  calves: "小腿肌群",
  "cardiovascular system": "心肺系统",
  delts: "三角肌",
  forearms: "前臂肌群",
  glutes: "臀肌",
  hamstrings: "腘绳肌",
  lats: "背阔肌",
  "levator scapulae": "肩胛提肌",
  pectorals: "胸肌",
  quads: "股四头肌",
  "serratus anterior": "前锯肌",
  spine: "竖脊肌",
  traps: "斜方肌",
  triceps: "肱三头肌",
  "upper back": "上背肌群",
};

export const EXERCISE_NAME_ZH = {
  "3/4 sit-up": "四分之三仰卧起坐",
  "air bike": "空中单车卷腹",
  "alternate heel touchers": "交替触踝",
  "archer pull up": "射手引体向上",
  "archer push up": "射手俯卧撑",
  "back and forth step": "前后交替踏步",
  "barbell bench press": "杠铃卧推",
  "barbell bent over row": "杠铃俯身划船",
  "barbell biceps curl": "杠铃弯举",
  "barbell curl": "杠铃弯举",
  "barbell deadlift": "杠铃硬拉",
  "barbell front raise": "杠铃前平举",
  "barbell full squat": "杠铃深蹲",
  "bear crawl": "熊爬",
  burpee: "波比跳",
  "close-grip push-up (on knees)": "跪姿窄距俯卧撑",
  "dead bug": "死虫式",
  "diamond push-up": "钻石俯卧撑",
  "dumbbell biceps curl": "哑铃弯举",
  "dumbbell lateral raise": "哑铃侧平举",
  "front plank with twist": "转体平板支撑",
  "glute bridge march": "臀桥交替抬腿",
  "high knee against wall": "扶墙高抬腿",
  "jack burpee": "开合波比跳",
  "jack jump (male)": "开合跳",
  "low glute bridge on floor": "地面臀桥",
  "mountain climber": "登山跑",
  "pull-up": "引体向上",
  run: "跑步",
};

export const FEATURED_IDS = [
  "0025",
  "0043",
  "0032",
  "0652",
  "0294",
  "0334",
  "0001",
  "1160",
  "0630",
  "0283",
  "0464",
  "3561",
  "0276",
  "2398",
  "3360",
  "0685",
];

export function bodyPartLabel(value) {
  return BODY_PART_LABELS[value] || value || "未分类";
}

export function equipmentLabel(value) {
  return EQUIPMENT_LABELS[value] || value || "未标注";
}

export function targetLabel(value) {
  return TARGET_LABELS[value] || value || "未标注";
}

export function exerciseTitle(exercise) {
  return coreMetadata(exercise)?.title || EXERCISE_NAME_ZH[exercise?.name] || exercise?.name || "未命名动作";
}

export function exerciseSearchText(exercise) {
  return [
    exercise.name,
    exerciseTitle(exercise),
    EXERCISE_NAME_ZH[exercise.name],
    bodyPartLabel(exercise.body_part),
    equipmentLabel(exercise.equipment),
    targetLabel(exercise.target),
    exercise.instructions?.zh,
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("zh-CN");
}
