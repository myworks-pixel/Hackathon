export const coordinatorCatalog: ReadonlyArray<
  readonly [string, string, string]
> = [
  [
    "总智能体正在规划与分派任务",
    "総合エージェントが計画・担当分けをしています",
    "Coordinator is planning and delegating",
  ],
  [
    "理解请求、选择专业智能体，并汇总实际结果。",
    "依頼を理解し、必要な専門エージェントを選んで結果をまとめます。",
    "Understand the request, select specialists and summarize actual results.",
  ],
  [
    "已根据专业智能体的实际结果完成汇总。",
    "専門エージェントの実際の結果をまとめました。",
    "Summarized the specialists’ actual results.",
  ],
  [
    "离线验证使用固定样例规则，不调用模型。",
    "オフライン検証では固定のサンプル規則を使い、モデルを呼びません。",
    "Offline verification uses fixed sample rules without model calls.",
  ],
  [
    "离线验证仅支持样例数据。",
    "オフライン検証はサンプルデータでのみ利用できます。",
    "Offline verification is available only for sample data.",
  ],
  ["执行模式无效。", "実行モードが無効です。", "Invalid execution mode."],
  [
    "前置任务尚未完成，此智能体未启动。",
    "前提の作業が未完了のため、このエージェントは起動していません。",
    "This agent has not started because a dependency is incomplete.",
  ],
  [
    "工具参数或返回数据格式不正确，未确认执行成功。",
    "ツールの入力または結果の形式が不正です。実行成功を確認できません。",
    "Tool arguments or results are invalid; success was not verified.",
  ],
  [
    "本步骤未完成，请检查连接设置和输入信息。",
    "この処理は未完了です。接続設定と入力内容を確認してください。",
    "This step did not finish. Check connection settings and input.",
  ],
  [
    "模型未调用必要的规划工具，请使用支持工具调用的 Nosana 模型。",
    "モデルが必須の計画ツールを呼びませんでした。ツール呼び出し対応の Nosana モデルを使用してください。",
    "The model did not call the required planning tool. Use a Nosana model that supports tools.",
  ],
  [
    "模型未按要求先生成任务计划，未执行工具。",
    "モデルが最初に計画を作成しなかったため、ツールを実行していません。",
    "The model did not plan first; no tools were executed.",
  ],
  [
    "模型没有返回有效答复。",
    "モデルから有効な応答が返りませんでした。",
    "The model did not return a valid answer.",
  ],
  [
    "模型达到工具调用上限，已停止后续执行。",
    "ツール呼び出し上限に達したため、後続処理を停止しました。",
    "The tool-call limit was reached; further execution stopped.",
  ],
  [
    "模型重复使用工具调用标识，已停止执行。",
    "モデルが呼び出しIDを再利用したため、実行を停止しました。",
    "The model reused a tool-call ID; execution stopped.",
  ],
  [
    "已读取当前农场事实。",
    "農場の現在の情報を読み取りました。",
    "Read the current farm facts.",
  ],
  [
    "请先提供需要解析的图片或语音。",
    "解析する画像または音声を添付してください。",
    "Attach the image or audio to parse.",
  ],
  [
    "已转写当前语音附件。",
    "添付された音声を書き起こしました。",
    "Transcribed the attached audio.",
  ],
  [
    "已解析当前图片附件，业务数据仍需核对。",
    "添付画像を解析しました。業務データは確認が必要です。",
    "Parsed the image; business facts still require review.",
  ],
  [
    "已获取气象和配送公开资料。",
    "気象・配送の公開情報を取得しました。",
    "Retrieved public weather and delivery information.",
  ],
  [
    "已校验重复订单并保存待确认草稿，尚未承诺发货。",
    "重複注文を確認し、確認待ちの案を保存しました。発送は確約していません。",
    "Checked duplicates and saved drafts; shipping has not been promised.",
  ],
  [
    "已保存发货规则草案，等待农户确认边界。",
    "発送ルール案を保存しました。適用条件の確認待ちです。",
    "Saved the shipping rule draft, awaiting boundary confirmation.",
  ],
  [
    "已为确认订单生成作业邀请，等待负责人接单。",
    "確定注文の作業依頼を作成しました。担当者の引受待ちです。",
    "Created work offers for confirmed orders, awaiting acceptance.",
  ],
  [
    "没有待排程作业。",
    "予定を組む作業はありません。",
    "No tasks need scheduling.",
  ],
  [
    "Daytona 排程已校验，未自动接受任务或确认送达。",
    "Daytona の予定を検証しました。作業の引受や配達完了は自動確認していません。",
    "Validated the Daytona schedule without accepting tasks or confirming delivery.",
  ],
  [
    "请先提供箱子装好状态及客户的分批、到达要求。",
    "梱包状態と、お客様の分納・到着条件を教えてください。",
    "Provide packing status and the customer's split-shipment and arrival requirements.",
  ],
  [
    "已检查作业超时、负责人和交接凭据。",
    "期限超過、担当者、引渡し記録を確認しました。",
    "Checked overdue work, ownership and handover evidence.",
  ],
  [
    "请粘贴需要转换的 CSV 订单表。",
    "変換する CSV 注文表を貼り付けてください。",
    "Paste the CSV order table to convert.",
  ],
  [
    "CodeAF 转换结果已校验并保存为草稿，等待核对。",
    "CodeAF の変換結果を検証して案として保存しました。確認待ちです。",
    "Validated the CodeAF conversion and saved drafts for review.",
  ],
  [
    "任务计划已执行，请仅根据以下回执汇总。",
    "計画の処理が終了しました。以下の実行記録を基にまとめます。",
    "Plan execution finished; summarize only from these receipts.",
  ],
  [
    "本轮已有任务计划，不重复执行。",
    "この依頼には計画があるため、重複実行しません。",
    "This turn already has a plan; it will not run twice.",
  ],
  [
    "不能追加任务：请先处理当前计划或等待所需信息。",
    "現在の計画の完了または必要な情報を待ってから追加できます。",
    "Complete the current plan or wait for required information before adding work.",
  ],
  [
    "同一任务已经执行，不重复调用。",
    "同じ作業は実行済みのため、再呼び出ししません。",
    "The same task has already run; it will not be delegated again.",
  ],
  [
    "追加任务的实际结果已返回。",
    "追加作業の実際の結果が返りました。",
    "The additional assignment returned its actual result.",
  ],
];
