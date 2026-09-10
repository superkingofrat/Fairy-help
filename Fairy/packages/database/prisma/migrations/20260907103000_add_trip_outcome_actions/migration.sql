-- FU-13 可观测性：行程非成功结局（追问目的地/草稿失败/落库失败）也记行为日志
ALTER TYPE "BehaviorAction" ADD VALUE 'TRIP_UNRESOLVED';
ALTER TYPE "BehaviorAction" ADD VALUE 'TRIP_DRAFT_FAILED';
ALTER TYPE "BehaviorAction" ADD VALUE 'TRIP_PERSIST_FAILED';
