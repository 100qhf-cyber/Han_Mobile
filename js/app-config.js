// 배포 시 주입되는 기본 접속 정보.
//
// 이 파일은 GitHub Actions 가 배포할 때 저장소 Secret 으로 덮어쓴다
// (.github/workflows/deploy.yml 의 "Supabase 설정 주입" 단계).
// 저장소에는 항상 빈 값으로 남으므로 키가 git 히스토리에 들어가지 않는다.
//
// 값이 비어 있으면 앱은 로컬 모드로 뜨고, 설정 탭에서 직접 입력할 수 있다.
// 설정 탭에 입력한 값이 있으면 그쪽이 항상 우선한다.

export const APP_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: '',
};
